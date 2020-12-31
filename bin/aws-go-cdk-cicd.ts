#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { AwsGoCdkCicdStack } from '../lib/aws-go-cdk-cicd-stack';

const app = new cdk.App();
new AwsGoCdkCicdStack(app, 'AwsGoCdkCicdStack', {
    env: {
        region: '<region>',
        account: '<your-account-id>'
    }
});
app.synth()