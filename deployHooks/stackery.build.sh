#!/bin/bash
export stackery_config="$1"
npm i
npx samtsc --build-only --skip-init-deploy
cd .build/root
sam build --build-dir ../../.aws-sam/build
cd ../..
