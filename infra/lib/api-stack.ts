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
  /**
   * Local directory `Code.fromAsset` zips as the Lambda deployment package.
   * Callers own how it's produced: `bin/app.ts` points at the real
   * `backend/dist-lambda` build (see its `ensureLambdaAssetBuilt`), while
   * unit tests point at a tiny fixture directory so `infra`'s test suite
   * never depends on a backend build existing on disk.
   */
  readonly lambdaAssetPath: string;
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
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      memorySize: 1024,
      timeout: Duration.seconds(15),
      handler: 'dist/src/lambda.handler',
      code: Code.fromAsset(props.lambdaAssetPath),
      logGroup,
      environment: {
        CORS_ALLOWED_ORIGINS: `https://${props.webStackDomain}`,
        SSM_PARAM_PREFIX,
        PRODUCTS_TABLE_NAME: props.productsTable.tableName,
        CUSTOMERS_TABLE_NAME: props.customersTable.tableName,
        DELIVERIES_TABLE_NAME: props.deliveriesTable.tableName,
        TRANSACTIONS_TABLE_NAME: props.transactionsTable.tableName,
        // Non-secret backend config (backend's env.validation.ts requires
        // both at boot). Real values come from GitHub Actions vars in
        // deploy.yml (see design's Manual Prerequisites); these generic
        // placeholders keep offline `cdk synth` working and never name the
        // payment gateway vendor.
        PAYMENT_GATEWAY_URL: process.env.PAYMENT_GATEWAY_URL ?? 'https://payment-gateway.invalid',
        PAYMENT_GATEWAY_PUBLIC_KEY: process.env.PAYMENT_GATEWAY_PUBLIC_KEY ?? 'pk_placeholder',
      },
    });

    const tables = [
      props.productsTable,
      props.customersTable,
      props.deliveriesTable,
      props.transactionsTable,
    ];
    for (const table of tables) {
      table.grantReadWriteData(fn);
    }

    // grantReadWriteData() does not include TransactWriteItems.
    // Required by: customers' at-most-one-per-email create() guard
    // (2-item Put transaction) and transactions' settleApproved()
    // (3-item Update/Update/Put transaction across Transactions, Products,
    // and Deliveries). ConditionCheckItem is already covered by
    // grantReadWriteData()'s RESOURCE_READ_DATA_ACTIONS — no separate
    // ConditionCheck transact-item type is used by either flow (conditions
    // are inlined on the Put/Update items themselves).
    fn.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['dynamodb:TransactWriteItems'],
        resources: tables.map((table) => table.tableArn),
      }),
    );

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
        // The account's default `aws/ssm` AWS-managed key has no static,
        // importable ARN reachable without a context lookup (forbidden —
        // offline synth/tests, no AWS account exists yet). Per AWS's
        // documented pattern for AWS-managed keys, scope via a ViaService
        // condition instead of a resource ARN: only decrypt calls made
        // *through* SSM in this account/region are authorized — still
        // least-privilege, just condition-scoped rather than ARN-scoped.
        resources: ['*'],
        conditions: {
          StringEquals: { 'kms:ViaService': `ssm.${this.region}.amazonaws.com` },
        },
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

