import * as path from 'node:path';

import { CfnOutput, Duration, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { HttpApi } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Architecture, Code, Function as LambdaFunction, Runtime } from 'aws-cdk-lib/aws-lambda';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

/** Generic path prefix — never the payment gateway company's name. */
export const SSM_PARAM_PREFIX = '/checkout/gateway';
const SSM_SECRET_SUFFIXES = ['private-key', 'integrity-secret', 'events-secret'];

export interface ApiStackProps extends StackProps {
  readonly productsTable: ITable;
  readonly customersTable: ITable;
  readonly deliveriesTable: ITable;
  readonly transactionsTable: ITable;
  /** CloudFront distribution domain from `WebStack`, used for CORS. */
  readonly webStackDomain: string;
}

/**
 * Lambda (zip of `nest build` output + pruned prod `node_modules`) behind an
 * HTTP API `$default` stage. IAM is least-privilege: read/write on the 4
 * DataStack tables (+ their GSIs), `ssm:GetParameter` on exactly the 3
 * payment-gateway SecureString params, and `kms:Decrypt` on the account's
 * default `aws/ssm` managed key. No secret values are ever set as plain
 * Lambda env vars — they are fetched from SSM at cold start instead.
 */
export class ApiStack extends Stack {
  public readonly api: HttpApi;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const logGroup = new LogGroup(this, 'FunctionLogGroup', {
      retention: RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const fn = new LambdaFunction(this, 'CheckoutFunction', {
      functionName: 'checkout-api',
      runtime: Runtime.NODEJS_20_X,
      architecture: Architecture.ARM_64,
      memorySize: 1024,
      timeout: Duration.seconds(15),
      handler: 'dist/src/lambda.handler',
      code: Code.fromAsset(path.join(__dirname, '../../backend/dist-lambda')),
      logGroup,
      environment: {
        CORS_ALLOWED_ORIGINS: `https://${props.webStackDomain}`,
        SSM_PARAM_PREFIX,
        PRODUCTS_TABLE_NAME: props.productsTable.tableName,
        CUSTOMERS_TABLE_NAME: props.customersTable.tableName,
        DELIVERIES_TABLE_NAME: props.deliveriesTable.tableName,
        TRANSACTIONS_TABLE_NAME: props.transactionsTable.tableName,
      },
    });

    for (const table of [
      props.productsTable,
      props.customersTable,
      props.deliveriesTable,
      props.transactionsTable,
    ]) {
      table.grantReadWriteData(fn);
    }

    const ssmParamArns = SSM_SECRET_SUFFIXES.map(
      (suffix) =>
        `arn:aws:ssm:${this.region}:${this.account}:parameter${SSM_PARAM_PREFIX}/${suffix}`,
    );
    fn.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['ssm:GetParameter'],
        resources: ssmParamArns,
      }),
    );
    fn.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['kms:Decrypt'],
        resources: [`arn:aws:kms:${this.region}:${this.account}:alias/aws/ssm`],
      }),
    );

    const integration = new HttpLambdaIntegration('LambdaIntegration', fn);
    this.api = new HttpApi(this, 'HttpApi', {
      apiName: 'checkout-api',
      defaultIntegration: integration,
      createDefaultStage: false,
    });
    this.api.addStage('DefaultStage', {
      autoDeploy: true,
      throttle: { rateLimit: 50, burstLimit: 100 },
    });

    new CfnOutput(this, 'ApiUrl', { value: this.api.apiEndpoint });
  }
}

