# Part 2: Let's Go!


## Adding Hello World serverless application

For simplicity, I used `aws-sam-cli` to generate a sample Go serverless application. Create a `myapp/hello-world` directory

### Code

`myapp/hello-world/main.go`
```go
package main
import (
	"errors"
	"fmt"
	"io/ioutil"
	"net/http"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
)

var (
	// DefaultHTTPGetAddress Default Address
	DefaultHTTPGetAddress = "https://checkip.amazonaws.com"

	// ErrNoIP No IP found in response
	ErrNoIP = errors.New("No IP in HTTP response")

	// ErrNon200Response non 200 status code in response
	ErrNon200Response = errors.New("Non 200 Response found")
)

func handler(request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	resp, err := http.Get(DefaultHTTPGetAddress)
	if err != nil {
		return events.APIGatewayProxyResponse{}, err
	}

	if resp.StatusCode != 200 {
		return events.APIGatewayProxyResponse{}, ErrNon200Response
	}

	ip, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return events.APIGatewayProxyResponse{}, err
	}

	if len(ip) == 0 {
		return events.APIGatewayProxyResponse{}, ErrNoIP
	}

	return events.APIGatewayProxyResponse{
		Body:       fmt.Sprintf("Hello, %v", string(ip)),
		StatusCode: 200,
	}, nil
}

func main() {
	lambda.Start(handler)
}
```

`myapp/hello-world/main_test.go`

```go
package main

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/aws/aws-lambda-go/events"
)

func TestHandler(t *testing.T) {
	t.Run("Unable to get IP", func(t *testing.T) {
		DefaultHTTPGetAddress = "http://127.0.0.1:12345"

		_, err := handler(events.APIGatewayProxyRequest{})
		if err == nil {
			t.Fatal("Error failed to trigger with an invalid request")
		}
	})

	t.Run("Non 200 Response", func(t *testing.T) {
		ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(500)
		}))
		defer ts.Close()

		DefaultHTTPGetAddress = ts.URL

		_, err := handler(events.APIGatewayProxyRequest{})
		if err != nil && err.Error() != ErrNon200Response.Error() {
			t.Fatalf("Error failed to trigger with an invalid HTTP response: %v", err)
		}
	})

	t.Run("Unable decode IP", func(t *testing.T) {
		ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(500)
		}))
		defer ts.Close()

		DefaultHTTPGetAddress = ts.URL

		_, err := handler(events.APIGatewayProxyRequest{})
		if err == nil {
			t.Fatal("Error failed to trigger with an invalid HTTP response")
		}
	})

	t.Run("Successful Request", func(t *testing.T) {
		ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(200)
			fmt.Fprintf(w, "127.0.0.1")
		}))
		defer ts.Close()

		DefaultHTTPGetAddress = ts.URL

		_, err := handler(events.APIGatewayProxyRequest{})
		if err != nil {
			t.Fatal("Everything should be ok")
		}
	})
}
```
Make sure your application builds

```bash
go build -o .build/hello-world/hello-world ./myapp/hello-world/
```
### A few gotchas - will make sense in a bit 

* Lambda runtime for Golang requires each lambda handler to have thier own built binary
* AWS CDK lambda code assert **MUST** be `.zip` or a `directory`

Because of those two gotchas, we'll have to make our build script compiles each of the handler app into their own directory. 

```bash
#!/bin/bash

rm -rf .build
declare -a StringArray=("hello-world")
for val in ${StringArray[@]}; do
    echo "building $val"
    GOOS=linux go build -o .build/$val/handler ./myapp/$val
done
```

This puts all the built artifacts in `./build/<app>/handler` simplifying the infrastructure code a bit because `handler` property of all the lambda functions are the same value: `handler`

## CDK infrastructure code

Create `app-stack.ts` file under `./lib`. This is the Serverless Application Infrastructure code. 

```typescript
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
            handler: 'handler', // THIS IS THE NAME OF BUILT EXECUTABLE
            code: lambda.Code.fromAsset(path.join(__dirname, '..', '.build', 'hello-world')), // THIS MUST BE A DIRECTORY
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
```

To test the deployment, add `ApplicationStack` to `./bin/aws-go-cdk-cicd.ts`

```typescript
#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { AwsGoCdkCicdStack } from '../lib/aws-go-cdk-cicd-stack';
import { ApplicationStack } from '../lib/app-stack';

const app = new cdk.App();
new AwsGoCdkCicdStack(app, 'AwsGoCdkCicdStack', {
    env: {
        region: '<region>',
        account: '<your-account-id>'
    }
});

// stand-alone Application stack
new ApplicationStack(app, 'MyTestStack', {
    env: {
        region: '<region>',
        account: '<your-account-id>'
    }
});

app.synth()
```

Then run 

```bash
cdk synth 
cdk deploy -a MyTestStack
```

## The CI/CD part

Add application to a code-pipeline stage. This wraps r application stack into a deployable unit for Code Pipeline to deploy as CloudFormation stack

`./lib/app-pipeline-stage.ts`
```typescript
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
```

Add application stage to the ci/cd pipeline stack 


`./lib/app-pipeline-stage.ts`
```typescript
export class AwsGoCdkCicdStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    ... /* existing code */
    
    const dev = new PipelineApplicationStage(this, 'develop',
        {
        env: {account: '<aws-account>', region: '<aws-region>'}
        });
    pipeline.addApplicationStage(dev);
}
```

Then commit and push. Pipeline will automatically update itself and deploy the application (image goes here)


## Tips

### Use build/test scripts instead of commands

`SimpleSynthAction` allows for adding `buildCommand` property for building the serverless application. Do not use a single command such as `go build` because if that fails, the pipeline will be stuck and not able to update itself to fix the issue. Instead, wrap that command in a script so it's dynamically change as the repo gets updated. 

### Pipelines can be deleted without deleting the Application stack

Pipeline and Application stacks are separate CloudFormation resource. The application stack deployed through `pipeline.addApplication()` stay around even after the pipeline stack is deleted; therefore, if you can delete/re-create the pipeline as needed if they break with no impact to the application users. Just be careful about not renaming the "ID" of stack resources because that'll cause the pipeline to create a new stack instead of using the existing one.

### Turn off Self-Mutate for speed

CdkPipeline allows us to disable self-mutate pipeline stage in case that trying to update build pipeline every commit is not desirable. Personally, I like the consistency and peace of mind that the pipeline is always up-to-date with the repository but if your requirements is that deployment must be faster than self-mutate step allows to, there is that option. 


