import { Lambda, SecretsManager } from 'aws-sdk';

const lambda = new Lambda();
const secrets = new SecretsManager();

/**
 * This lambda triggers when a layer is updated/added to cloudwatch  it checks to see if the description
 * conains auto update. If so it checks every lambda function to see if that layer is used and updates the layer version.
 */
module.exports.eventHandler = async (event) => {
    console.log(JSON.stringify(event));

    const layerArn = event.detail.responseElements.layerVersionArn;
    console.log(`processing layerArn: ${layerArn}`);
    if(event.detail.responseElements.description.indexOf('auto update') < 0) {
        return;
    }
    // get the prefix which is the arn without the layer version
    let lastColon = layerArn.lastIndexOf(':') + 1;
    const prefix = layerArn.slice(0, lastColon - 1);
    console.log(`prefix: ${prefix}`);
    lastColon = prefix.lastIndexOf(':') + 1;
    
    // construct the path to store the most current version of the layer in secrets manager
    const key = `layers/${layerArn.slice(lastColon, prefix.length)}`;
    console.log(`Getting layer reference ${key}`);

    let layerSecret;
    
    // look up the arn
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

    // if no secret exists for the layer add one, otherwise update it
    if(!layerSecret) {
        console.log('Creating secret')
        await secrets.createSecret({
            Name: key,
            SecretString: value
        }).promise();
    } else {
        console.log(`Updating layer reference ${key}: ${value}`);
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
    const eventTime = new Date(event.detail.eventTime);

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
            if(new Date(item.LastModified).getTime() > eventTime.getTime()) {
                return;
            }
            let layers = item.Layers.map(layer => layer.Arn);
            const index = layers.findIndex(layer => layer.startsWith(prefix));
            
            // if none of the functions layers match the layer we are updating there is nothing left to do
            if(index < 0) {
                return;
            }
            console.log(`Applying new version of layer to lambda ${item.FunctionName}`);
            console.log('Layers Before', layers);
            
            // update the layer to the new version if it matches the layer being updated
            layers = await Promise.all(layers.map((arn) => {
                if (arn.startsWith(prefix)) {
                    console.log(`Getting latest layer for ${arn} in ${item.FunctionName}`);
                    // return getLatestLayer(arn, lookup);
                    // no need to lookup the arn in secrets manager we have it already.
                    return layerArn;
                }
                else {
                    console.log(`Not replacing layer ${arn} in ${item.FunctionName}`);
                    return arn;
                }
            }));

            console.log('Layers', layers);
            console.log(item.Layers.length);

            // check to make sure none of the layer arns returned from the map are undefined 
            if(layers.filter(x => x? true : false).length != item.Layers.length) {
                throw new Error(`Layers after processing don't match before processing (${layers})(${item.Layers})`);
            }

            // update the function with the updated layers
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
        return lookup[key];
    }

    try {
        console.log(`Getting secret for key ${key}`);
        let layerSecret = await secrets.getSecretValue({
            SecretId: key
        }).promise();

        lookup[key] = JSON.parse(layerSecret.SecretString).latest;
        return lookup[key];
    } catch (err) {
        console.log('err');
        lookup[key] = layerArn;
    }

    return lookup[key];
}