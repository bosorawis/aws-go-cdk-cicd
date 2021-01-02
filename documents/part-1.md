# Part 1: Github to Pipeline

## WARNING

This guide will go over AWS free-tier. Specifically for any AWS account with an existing Pipeline ($1/pipeline). 

All Examples are done in `us-west-2` region but feel free to replace it with any region as long as they have all the required features


## Prerequisite

* [aws-cdk](https://docs.aws.amazon.com/cdk/latest/guide/getting_started.html)

* [Go](https://golang.org/doc/install)


## Getting Started

This part 1 is for setting up a repository, aws account, and an empty pipeline for triggering builds.

### Instantiate Project


Start with an empty git repository

```bash
cdk init --language typescript  
```

Now you should have a directory tree looking something like

```bash
├── bin
│   └── aws-go-cdk-cicd.ts 
├── cdk.json
├── # lib <- most infrastructure code goes here
│   └── aws-go-cdk-cicd-stack.ts
```

This will be your infrastructure code. Most infrastructure code changes will be done in `lib` directory.

As of writing this article, CDK Pipeline requires additional settings in `cdk.json`. So enter this code there

```json
{ 
  "context": {
    ...
    "@aws-cdk/core:newStyleStackSynthesis": true
  }
}
```

## Prepping AWS Account

### Github connector
This is a version 2 of how AWS CodePipeline connects to Github. Follow this [guide](https://docs.aws.amazon.com/codepipeline/latest/userguide/update-github-action-connections.html)
to create the connector. 

Or 

1. Browse to `AWS CodePipeline` in your region, and click "Create Pipeline"
2. Follow the prompt until you get to `Add Source Stage`
3. Select `GitHub (Version 2)`
4. Click "Connect to GitHub" then name your connection
5. Click "Install a new app" and follow the prompts
6. Once done, note down the ARN that appears in `connection` text box. That's your CodeStar connection ARN. 
7. Hit cancel. Do not create the pipeline creation if you'd like to keep this tutorial under free tier. Completing pipeline creation can result in `$1` charge once
we get to creating the real pipeline. 

For future convenience, copy the Connector ARN and put it in AWS SSM Parameter store

```bash
aws ssm put-parameter \
--name GITHUB_CONNECTOR_ARN \
--description "Github Codestar connector ARN for CodePipeline Github source version 2" \
--value "<ARN GOES HERE>" --type String --region us-west-2
```

### Bootstrapping CDK Environment

CDK provide a [bootstrap](https://docs.aws.amazon.com/cdk/latest/guide/bootstrapping.html) command to prepare an AWS account/region with IAM roles, IAM policies, metadata, etc. You can do this by running

```bash
# More info https://docs.aws.amazon.com/cdk/latest/guide/bootstrapping.html
npx cdk bootstrap \
  --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess \
```


## Creating an Empty pipeline

### Install Dependencies
```bash
npm install @aws-cdk/pipelines \ 
@aws-cdk/aws-codepipeline-actions \ 
@aws-cdk/aws-codepipeline \
@aws-cdk/aws-ssm \ 
@aws-cdk/core \ 
@aws-cdk/aws-apigateway \ 
@aws-cdk/aws-lambda \ 
```

### Pipeline code

In `./lib`

```typescript
// aws-go-cdk-cicd-stack.ts
import * as cdk from '@aws-cdk/core';
import * as codepipeline from '@aws-cdk/aws-codepipeline';
import * as codepipeline_actions from '@aws-cdk/aws-codepipeline-actions';
import * as ssm from "@aws-cdk/aws-ssm";
import { CdkPipeline, SimpleSynthAction } from "@aws-cdk/pipelines";

export class AwsGoCdkCicdStack extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        // The code that defines your stack goes here

        const sourceArtifact = new codepipeline.Artifact();
        const cloudAssemblyArtifact = new codepipeline.Artifact();

        const pipeline = new CdkPipeline(this, "cicdPipeline", {
            cloudAssemblyArtifact: cloudAssemblyArtifact,
            selfMutating: true,
            sourceAction: new codepipeline_actions.BitBucketSourceAction({
                owner: '<GITHUB-ACCOUNT>', // Your GitHub account name
                repo: '<REPO-NAME>', // Your GitHub repo
                branch: 'main',
                actionName: 'GitHub',
                output: sourceArtifact,
                codeBuildCloneOutput: true,
                connectionArn: ssm.StringParameter.valueFromLookup(this, 'GITHUB_CONNECTOR_ARN ')
            }),
            synthAction: SimpleSynthAction.standardNpmSynth({
                cloudAssemblyArtifact: cloudAssemblyArtifact,
                sourceArtifact: sourceArtifact,
                installCommand: 'npm ci'
            })
        })

    }
}
```

In `./bin`

```typescript
// aws-go-cdk-cicd.ts

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
```

