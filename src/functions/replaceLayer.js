const aws = require('aws-sdk');
const lambda = new aws.Lambda();
const secrets = new aws.SecretsManager();

module.exports.eventHandler = async (event) => {
    console.log(JSON.stringify(event));

    const layerArn = event.detail.responseElements.layerVersionArn;

    if(event.detail.responseElements.description.indexOf('auto update') < 0) {
        return;
    }

    const lastColon = layerArn.lastIndexOf(':') + 1;
    const prefix = layerArn.slice(0, lastColon);

    const key = `layers/${layerArn.slice(lastColon, prefix.length)}`;

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
    const lookup = {};
    lookup[key] = layerArn;

    do {
        let listResponse = await lambda.listFunctions({
            Marker: marker,
            MaxItems: 50
        }).promise();

        console.log(JSON.stringify(listResponse));
        marker = listResponse.NextMarker;

        promises.push(...listResponse.Functions.map(async (item) => {
            if(!item.Layers) {
                return;
            }
            let layers = item.Layers.map(layer => layer.Arn);
            const index = layers.findIndex(layer => layer.startsWith(prefix));
            if(index < 0) {
                return;
            }
            console.log(`Applying new version of layer to lambda ${item.FunctionName}`);
            layers = await Promise.all(layers.map(arn => getLatestLayer(arn, lookup)));
            console.log('Layers', layers);

            if(layers.filter(x => Object.keys(x).length > 0) != item.Layers) {
                throw new Error(`Layers after processing don't match before processing (${layers})(${item.layers})`);
            }

            try {
                await lambda.updateFunctionConfiguration({
                    FunctionName: item.FunctionName,
                    Layers: layers
                }).promise();
            } catch (err) {
                console.log(item.FunctionName, err);
            }
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

async function getLatestLayer(layerArn, lookup) {
    let prefix = layerArn.slice(0, layerArn.lastIndexOf(':'));
    prefix = prefix.slice(prefix.lastIndexOf(':') + 1, prefix.length);

    const key = `layers/${prefix}`;
    console.log('Layer Key', key);

    if(lookup[key]) {
        return lookup[layerArn];
    }

    try {
        let layerSecret = await secrets.getSecretValue({
            SecretId: key
        }).promise();

        lookup[key] = JSON.parse(layerSecret.SecretString).latest;
    } catch (err) {
        lookup[key] = layerArn;
        return layerArn;
    }
}