import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda';
import * as path from 'path';
import * as apigateway from '@aws-cdk/aws-apigateway'
import {CfnOutput} from "@aws-cdk/core";

export class ApplicationStack extends cdk.Stack {

    public readonly urlOutput: CfnOutput;
    constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const backend = new lambda.Function(this, 'myFunction', {
            runtime: lambda.Runtime.GO_1_X,
            handler: 'handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '..', '.build', 'hello-world')),
            memorySize: 1024,
            timeout: cdk.Duration.seconds(30),
        });
        const apigw = new apigateway.LambdaRestApi(this, 'myApi', {
            handler: backend,
            proxy: false
        });

        const items = apigw.root.addResource('hello');
        items.addMethod('GET');  // GET hello

        this.urlOutput = new CfnOutput(this, 'Url', {
            value: apigw.url,
        });

    }
}