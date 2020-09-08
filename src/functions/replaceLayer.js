const aws = require('aws-sdk');
const lambda = new aws.Lambda();
const secrets = new aws.SecretsManager();

module.exports.eventHandler = async (event) => {
    console.log(JSON.stringify(event));

    const layerArn = event.detail.responseElements.layerVersionArn;

    if(event.detail.responseElements.description.indexOf('auto update') < 0) {
        return;
    }

    const prefix = event.detail.responseElements.layerArn;

    const lastColon = prefix.lastIndexOf(':') + 1;
    const key = `layers/${prefix.slice(lastColon, prefix.length)}`;

    let layerSecret;
    
    try {
        layerSecret = await secrets.describeSecret({
            SecretId: key,
        }).promise();
    } catch (err) {
        console.log(err);
        if(err.code !== 'ResourceNotFoundException') {
            throw err;
        }
    }

    const value = JSON.stringify({
        latest: event.detail.responseElements.layerVersionArn
    });
    if(!layerSecret) {
        console.log('Creating secret')
        await secrets.createSecret({
            Name: key,
            SecretString: value
        }).promise();
    } else {
        await secrets.updateSecret({
            SecretId: key,
            SecretString: value
        }).promise();
    }

    let marker = undefined;
    const promises = [];
    let failed = 0;

    do {
        let listResponse = await lambda.listFunctions({
            Marker: marker,
            MaxItems: 50
        }).promise();

        console.log(JSON.stringify(listResponse));
        marker = listResponse.NextMarker;

        promises.push(...listResponse.Functions.map(item => {
            if(!item.Layers) {
                return;
            }
            const layers = item.Layers.map(layer => layer.Arn);
            const index = layers.findIndex(layer => layer.startsWith(prefix));
            if(index < 0) {
                return;
            }
            console.log('Applying new version of layer to lambda');
            layers[index] = layerArn;

            return lambda.updateFunctionConfiguration({
                FunctionName: item.FunctionName,
                Layers: layers
            }).promise();
        }));
        failed += await awaitComplete(promises);
    } while(marker);

    failed += await awaitComplete(promises);

    if(failed > 0) {
        throw new Error(`Could not update all layer references. Failed count ${failed}`);
    }
}

async function awaitComplete(promises) {
    let failedCount = 0;
    for(const p of promises) {
        try {
        await p;
        } catch (err) {
            console.log(err);
            failedCount++;
        }
    }

    return failedCount;
}