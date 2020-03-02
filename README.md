# serverless-plugin-layer-updater
Allows serverless projects to reference the latest version of a layer, with the added ability to update lambda functions automatically to reference a new layer version when one is published.  While this solution is designed to help the serverless framework, it can be deployed for non-serverless framework systems as well (such as the SAM framework).

[![Generic badge](https://img.shields.io/badge/Latest-1.0.3-<COLOR>.svg)](https://shields.io/) [![PyPI license](https://img.shields.io/pypi/l/ansicolortags.svg)](https://pypi.python.org/pypi/ansicolortags/)

## Design:
The serverless-plugin-layer-updater uses an automated design to keep all functions up to date, while not breaking cloudformation rollbacks.

![img design](assets/serverless-plugin-layer-updater.png)

# Implementing Plugin
The serverless plugin is to help the serverless framework with issues outside of "serverless deploy" which will work fine without the plugin.  Where the plugin is needed is when doing a "serverless deploy function", which has not been updated to support secret string resolution which is supported by cloudformation.

## Installing the plugin
Install the plugin into the directory your serverless.yml is located
``` bash
npm install serverless-plugin-layer-updater
```

## Using the plugin
Add the decouple plugin to your plugins, and add a custom variable to turn it on
```yaml
plugins:
    - serverless-plugin-layer-updater

functions:
    myFunction:
        handler: src/handler.event
        layers:
            - "{{resolve:secretsmanager:layers/${The Layer's Name}:SecretString:latest}}"
```

Run the deploy command
```bash
serverless deploy function -f {function name}
```

# Implementing Auto Updater

Clone down the serverless-plugin-layer-updater repository.

```bash
git clone https://github.com/mutual-of-enumclaw/serverless-plugin-layer-updater.git
```

Run the command to install dependencies and deploy
```bash
npm i
serverless deploy
```

Deploy your layer with "auto update" somewhere in the description

```yaml
layers:
    mylayer:
        path: layerPath
        description: This is my layer (auto updates)
```

When the layer deploys, all functions which reference it's prior version will automatically be updated to use the latest version of the plugin
