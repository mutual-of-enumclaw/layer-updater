const aws = require('aws-sdk');
const lambda = new aws.Lambda();
const ssm = new aws.SSM();

module.exports.eventHandler = async (event) => {
    console.log(JSON.stringify(event));

    const layerArn = event.detail.responseElements.layerVersionArn;

    if(event.detail.responseElements.description.indexOf('auto update') < 0) {
        return;
    }

    const prefix = event.detail.responseElements.layerArn;

    const lastColon = prefix.lastIndexOf(':') + 1;
    await ssm.putParameter({
        Name: `layers-${prefix.slice(lastColon, prefix.length)}-latest`,
        Type: 'String',
        Value: event.detail.responseElements.layerVersionArn
    }).promise();

    let marker = undefined;
    const promises = [];

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
        await Promise.all(promises);
    } while(marker);

    await Promise.all(promises);
}