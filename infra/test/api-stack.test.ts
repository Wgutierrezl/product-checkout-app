import * as path from 'node:path';

import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';

import { ApiStack } from '../lib/api-stack';
import { DataStack } from '../lib/data-stack';

// A tiny placeholder directory, NOT the real backend build — keeps these
// unit tests independent of `backend/dist-lambda` existing on disk. Real
// deploys/synth use the actual build (see bin/app.ts's ensureLambdaAssetBuilt).
const FIXTURE_LAMBDA_ASSET_PATH = path.join(__dirname, 'fixtures/lambda-asset');

function synthApiStack(): Template {
  const app = new App();
  const dataStack = new DataStack(app, 'TestDataStack', {
    env: { account: '123456789012', region: 'us-east-1' },
  });
  const apiStack = new ApiStack(app, 'TestApiStack', {
    env: { account: '123456789012', region: 'us-east-1' },
    productsTable: dataStack.productsTable,
    customersTable: dataStack.customersTable,
    deliveriesTable: dataStack.deliveriesTable,
    transactionsTable: dataStack.transactionsTable,
    webStackDomain: 'd123456abcdef.cloudfront.net',
    lambdaAssetPath: FIXTURE_LAMBDA_ASSET_PATH,
  });
  return Template.fromStack(apiStack);
}

describe('ApiStack', () => {
  it('configures the Lambda with NODEJS_20_X, ARM_64, 1024MB, and a 15s timeout', () => {
    const template = synthApiStack();

    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs20.x',
      Architectures: ['arm64'],
      MemorySize: 1024,
      Timeout: 15,
      Handler: 'dist/src/lambda.handler',
    });
  });

  it('never exposes a secret value as a Lambda environment variable', () => {
    const template = synthApiStack();
    const secretPatterns = [/PRIVATE_KEY/i, /INTEGRITY_SECRET/i, /EVENTS_SECRET/i];

    const resources = template.findResources('AWS::Lambda::Function');
    const [, fn] = Object.entries(resources)[0];
    const envVars: Record<string, unknown> = fn.Properties.Environment.Variables;

    for (const key of Object.keys(envVars)) {
      expect(secretPatterns.some((pattern) => pattern.test(key))).toBe(false);
    }
    expect(envVars).toHaveProperty('CORS_ALLOWED_ORIGINS');
    expect(envVars).toHaveProperty('SSM_PARAM_PREFIX', '/checkout/gateway');
  });

  it('scopes IAM permissions to the 4 tables/GSIs, the 3 SSM params, and the SSM KMS key — no wildcard resource', () => {
    const template = synthApiStack();

    const policies = template.findResources('AWS::IAM::Policy');
    const statements = Object.values(policies).flatMap(
      (policy) => policy.Properties.PolicyDocument.Statement as Array<{
        Action: string | string[];
        Resource: unknown;
      }>,
    );

    for (const statement of statements) {
      expect(statement.Resource).not.toBe('*');
      if (Array.isArray(statement.Resource)) {
        expect(statement.Resource).not.toContain('*');
      }
    }

    const actions = statements.flatMap((statement) =>
      Array.isArray(statement.Action) ? statement.Action : [statement.Action],
    );
    expect(actions).toEqual(expect.arrayContaining(['ssm:GetParameter']));
    expect(actions).toEqual(expect.arrayContaining(['kms:Decrypt']));
    expect(
      actions.some((action) => typeof action === 'string' && action.startsWith('dynamodb:')),
    ).toBe(true);
  });

  it('grants dynamodb:TransactWriteItems on all 4 tables (settlement + customer email guard)', () => {
    const template = synthApiStack();

    const policies = template.findResources('AWS::IAM::Policy');
    const transactWriteStatements = Object.values(policies)
      .flatMap(
        (policy) =>
          policy.Properties.PolicyDocument.Statement as Array<{
            Effect: string;
            Action: string | string[];
            Resource: unknown;
          }>,
      )
      .filter(
        (statement) =>
          statement.Action === 'dynamodb:TransactWriteItems' ||
          (Array.isArray(statement.Action) &&
            statement.Action.includes('dynamodb:TransactWriteItems')),
      );

    expect(transactWriteStatements).toHaveLength(1);
    const [statement] = transactWriteStatements;
    expect(statement.Effect).toBe('Allow');
    expect(Array.isArray(statement.Resource)).toBe(true);
    expect(statement.Resource).toHaveLength(4);
  });

  it('exposes a throttled $default route', () => {
    const template = synthApiStack();

    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: '$default',
    });
    template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
      StageName: '$default',
      DefaultRouteSettings: Match.objectLike({
        ThrottlingRateLimit: 50,
        ThrottlingBurstLimit: 100,
      }),
    });
  });

  it('retains Lambda logs for 7 days with RemovalPolicy DESTROY', () => {
    const template = synthApiStack();

    template.hasResourceProperties('AWS::Logs::LogGroup', {
      RetentionInDays: 7,
    });
    template.hasResource('AWS::Logs::LogGroup', {
      DeletionPolicy: 'Delete',
    });
  });

  it('outputs the API invoke URL', () => {
    const template = synthApiStack();

    template.hasOutput('ApiUrl', {});
  });
});
