const aws = require('aws-sdk');

const cf = new aws.CloudFormation();
const lambda = new aws.Lambda();
const secrets = new aws.SecretsManager();

async function fixLayers() {
    let token;
    do {
        console.log('Getting stacks');
        const stacks = await cf.listStacks({
            NextToken: token
        }).promise();
        token = stacks.NextToken;

        for(let s of stacks.StackSummaries) {
            if(s.StackStatus == 'DELETE_COMPLETE') {
                continue;
            }
            
            console.log(`Getting template for stack ${s.StackName}`);
            let template;
            try {
                template = JSON.parse((await cf.getTemplate({
                    StackName: s.StackName
                }).promise()).TemplateBody);
            } catch (err) {
                console.error(err);
                continue;
            }

            let resources;
            for(let rKey in template.Resources) {
                const r = template.Resources[rKey];
                if(r.Type != 'AWS::Lambda::Function') {
                    continue;
                }

                if(!resources) {
                    console.log(`Getting stack resources for ${s.StackName}`);
                    resources = await cf.listStackResources({
                        StackName: s.StackName
                    }).promise();
                }
    
                if(!r.Properties || !r.Properties.Layers) {
                    continue;
                }
                console.log(`Finding function info ${rKey}`);
                const func = resources.StackResourceSummaries.find(x => x.LogicalResourceId == rKey);
                if(func) {
                    console.log(func.PhysicalResourceId);
                    const layers = await Promise.all(r.Properties.Layers.map(x => getLayerArn(x)));
                    const funcConfig = await lambda.getFunctionConfiguration({
                        FunctionName: func.PhysicalResourceId
                    }).promise();
                    if(!funcConfig.Layers || JSON.stringify(layers) != JSON.stringify(funcConfig.Layers.map(x => x.Arn))) {
                        console.log('Replacing Layers', layers, funcConfig.Layers? funcConfig.Layers.map(x => x.Arn) : []);
                        await lambda.updateFunctionConfiguration({
                            FunctionName: func.PhysicalResourceId,
                            Layers: layers
                        }).promise();
                    }
                }
            }
        }
    } while (token);
}

async function getLayerArn(layer) {
    const prefix = '{{resolve:secretsmanager:';
    if(!layer.startsWith(prefix)) {
        return layer
    }

    const secretName = layer.slice(prefix.length, layer.length - 22);
    const secret = await secrets.getSecretValue({
        SecretId: secretName
    }).promise();

    return JSON.parse(secret.SecretString).latest;
}

module.exports.fixLayers = fixLayers;
