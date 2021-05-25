#!/bin/bash
export stackery_config="$1"
rm package-lock.json
npm i
npx samtsc --build-only --skip-init-deploy
cd .build/root
sam build --build-dir ../../.aws-sam/build
cd ../..
