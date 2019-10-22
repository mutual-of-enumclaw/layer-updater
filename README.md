# serverless-plugin-layer-updater
Allows serverless projects to reference the latest version of a layer, with the added ability to update lambda functions automatically to reference a new layer version when one is published

# Implementing Plugin

Install the plugin into the directory your serverless.yml is located
``` bash
npm install serverless-plugin-layer-updater
```

Add the decouple plugin to your plugins, and add a custom variable to turn it on
```yaml
plugins:
    - serverless-plugin-decouple

functions:
    myFunction:
        handler: src/handler.event
        layers:
            - arn:aws:lambda:{{Region}}:{{AccountID}}:layers:mylayer:latest
```

Run the deploy command
```bash
serverless deploy
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