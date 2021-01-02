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
        owner: '<github-account>', // Your GitHub account name
        repo: '<repo-name>', // Your GitHub repo
        branch: 'main',
        actionName: 'GitHub',
        output: sourceArtifact,
        codeBuildCloneOutput: true,
        connectionArn: '<github-codestar-connection-arn>'
      }),
      synthAction: SimpleSynthAction.standardNpmSynth({
        cloudAssemblyArtifact: cloudAssemblyArtifact,
        sourceArtifact: sourceArtifact,
        installCommand: 'npm ci',
        buildCommand: './test.sh ; ./build.sh',
      })
    })

  }
}
