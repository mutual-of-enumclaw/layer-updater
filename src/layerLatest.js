'use strict';

const aws = require('aws-sdk');

class ServerlessPlugin {
    constructor(serverless, options) {
        this.serverless = serverless;
        this.options = options;

        this.hooks = {
        'before:package:createDeploymentArtifacts': this.package.bind(this),
        'before:package:function:package': this.package.bind(this)
        };
    }

    /**
     * Before packaging functions must be redirected to point at the binary built
     */
    async package() {
        this.serverless.cli.log(`Getting cloudformation`);

        aws.config.region = this.serverless.service.provider.region || 'us-east-1';
        if(this.serverless.service.provider.profile) {
            console.log('Using profile');
            var credentials = new aws.SharedIniFileCredentials({profile: this.serverless.service.provider.profile});
            aws.config.credentials = credentials;
        } else if (this.serverless.providers.aws.options['aws-profile']) {
            console.log('Using aws-profile');
            var credentials = new aws.SharedIniFileCredentials({profile: this.serverless.providers.aws.options['aws-profile']});
            aws.config.credentials = credentials;
        }
        const lambda = new aws.Lambda();
        const layers = [];
        let Marker = undefined;
        do {
            const layersResponse = await lambda.listLayers({
                CompatibleRuntime: this.serverless.service.provider.runtime,
                Marker
            }).promise();
            layers.push(...layersResponse.Layers);
            Marker = layersResponse.NextMarker;
        } while(Marker);

        Object.values(this.serverless.service.functions).forEach(f => {
            if(f.layers) {
                f.layers.forEach((layer, li) => {
                    if(layer.endsWith(':latest')) {
                        let prefix = layer.substr(0, layer.indexOf(':latest'));
                        prefix = prefix.substr(prefix.lastIndexOf(':'), prefix.length);
                        
                        const latest = layers.find(item => {
                            if(item.LayerArn.indexOf(prefix)) {
                                return item;
                            }
                        });
                        if(!latest) {
                            throw new Error('Could not find layer ' + layer);
                        }
                        f.layers[li] = latest.LatestMatchingVersion.LayerVersionArn;
                    }
                });
            }
        });
    }
}

module.exports = ServerlessPlugin