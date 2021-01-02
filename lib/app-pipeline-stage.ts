/**
 * Deployable unit of web service app
 */
import { CfnOutput, Construct, Stage, StageProps } from '@aws-cdk/core';
import { ApplicationStack } from './app-stack';

export class PipelineApplicationStage extends Stage {
    public readonly urlOutput: CfnOutput;

    constructor(scope: Construct, id: string, props?: StageProps) {
        super(scope, id, props);
        const service = new ApplicationStack(this, 'myApp');
        this.urlOutput = service.urlOutput;
    }
}
