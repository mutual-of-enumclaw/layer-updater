'use strict';

const aws = require('aws-sdk');

class ServerlessPlugin {
    constructor(serverless, options) {
        console.log('Setting up serverless-plugin-layer-updater');
        this.serverless = serverless;
        this.options = options;

        this.hooks = {
            'before:deploy:function:packageFunction': this.package.bind(this),
        };
    }

    /**
     * Before packaging functions must be redirected to point at the binary built
     */
    async package() {
        this.serverless.cli.log(`Finding layers to fix`);

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
        const secretsmanager = new aws.SecretsManager();
        const func = this.serverless.service.functions[this.options.function || this.options.f];
        
        for(let i = 0; i < func.layers.length; i++) {
            const x = func.layers[i];
            const match = x.match(/(?<=({{resolve:secretsmanager:))layers\/.*?(?=(:SecretString:latest}}))/);
            const paramMatch = x.match("(?<=(:SecretString:))latest?(?=(}}))");
            if(match.length > 0) {
                const secret = await secretsmanager.getSecretValue({
                    SecretId: match[0]
                }).promise();
                const obj = JSON.parse(secret.SecretString);
                this.serverless.cli.log('Assigning layer');
                func.layers[i] = obj[paramMatch[0]];
            }
        };
    }
}

module.exports = ServerlessPlugin
