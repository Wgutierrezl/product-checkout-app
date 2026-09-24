import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';

import { GithubOidcStack } from '../lib/github-oidc-stack';

interface IamRoleProperties {
  RoleName?: string;
  AssumeRolePolicyDocument: { Statement: Array<Record<string, unknown>> };
}

/**
 * `OpenIdConnectProvider` synthesizes its own Custom Resource Lambda
 * execution role (trusted by `lambda.amazonaws.com`) alongside our actual
 * `DeployRole` — `findResources('AWS::IAM::Role')` returns both, so we must
 * filter by the explicit `roleName` rather than assuming array order.
 */
function findDeployRole(template: Template): IamRoleProperties {
  const roles = template.findResources('AWS::IAM::Role');
  const match = Object.values(roles).find(
    (role) => (role.Properties as IamRoleProperties).RoleName === 'checkout-deploy',
  );
  expect(match).toBeDefined();
  return match!.Properties as IamRoleProperties;
}

function synthOidcStack(): Template {
  const app = new App();
  const stack = new GithubOidcStack(app, 'TestGithubOidcStack', {
    env: { account: '123456789012', region: 'us-east-1' },
    githubOrgRepo: 'Wgutierrezl/product-checkout-app',
  });
  return Template.fromStack(stack);
}

describe('GithubOidcStack', () => {
  it('creates a GitHub Actions OIDC provider trusting sts.amazonaws.com', () => {
    const template = synthOidcStack();

    template.hasResourceProperties('Custom::AWSCDKOpenIdConnectProvider', {
      Url: 'https://token.actions.githubusercontent.com',
      ClientIDList: ['sts.amazonaws.com'],
    });
  });

  it('trusts the deploy role only for this exact repo on refs/heads/main — no other repo or branch', () => {
    const template = synthOidcStack();

    const deployRole = findDeployRole(template);
    const trustStatement = deployRole.AssumeRolePolicyDocument.Statement[0];

    expect(trustStatement.Effect).toBe('Allow');
    expect(trustStatement.Action).toBe('sts:AssumeRoleWithWebIdentity');
    expect(trustStatement.Condition).toEqual({
      StringEquals: {
        'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
        'token.actions.githubusercontent.com:sub':
          'repo:Wgutierrezl/product-checkout-app:ref:refs/heads/main',
      },
    });
  });

  it('grants sts:AssumeRole on the CDK bootstrap roles only', () => {
    const template = synthOidcStack();

    const policies = template.findResources('AWS::IAM::Policy');
    const statement = Object.values(policies)
      .flatMap((policy) => policy.Properties.PolicyDocument.Statement)
      .find((s: { Action: string }) => s.Action === 'sts:AssumeRole');

    expect(statement).toBeDefined();
    expect(statement.Resource).toBe(
      'arn:aws:iam::123456789012:role/cdk-hnb659fds-*-role-123456789012-us-east-1',
    );
  });

  it('grants S3 sync permissions scoped to the checkout-web bucket only', () => {
    const template = synthOidcStack();

    const policies = template.findResources('AWS::IAM::Policy');
    const statement = Object.values(policies)
      .flatMap((policy) => policy.Properties.PolicyDocument.Statement)
      .find((s: { Action: unknown }) =>
        Array.isArray(s.Action) ? s.Action.includes('s3:PutObject') : false,
      );

    expect(statement).toBeDefined();
    expect(statement.Action).toEqual(
      expect.arrayContaining(['s3:PutObject', 's3:DeleteObject', 's3:ListBucket']),
    );
    expect(statement.Resource).toEqual(
      expect.arrayContaining([
        'arn:aws:s3:::checkout-web-123456789012',
        'arn:aws:s3:::checkout-web-123456789012/*',
      ]),
    );
  });

  it('grants cloudfront:CreateInvalidation scoped to this account only, not a global wildcard', () => {
    const template = synthOidcStack();

    const policies = template.findResources('AWS::IAM::Policy');
    const statement = Object.values(policies)
      .flatMap((policy) => policy.Properties.PolicyDocument.Statement)
      .find((s: { Action: string }) => s.Action === 'cloudfront:CreateInvalidation');

    expect(statement).toBeDefined();
    expect(statement.Resource).toBe('arn:aws:cloudfront::123456789012:distribution/*');
    expect(statement.Resource).not.toBe('*');
  });

  it('grants dynamodb:PutItem scoped to the Products table only (for idempotent seeding)', () => {
    const template = synthOidcStack();

    const policies = template.findResources('AWS::IAM::Policy');
    const statement = Object.values(policies)
      .flatMap((policy) => policy.Properties.PolicyDocument.Statement)
      .find((s: { Action: string }) => s.Action === 'dynamodb:PutItem');

    expect(statement).toBeDefined();
    expect(statement.Resource).toBe('arn:aws:dynamodb:us-east-1:123456789012:table/Products');
  });

  it('outputs the deploy role ARN', () => {
    const template = synthOidcStack();

    template.hasOutput('DeployRoleArn', {});
  });

  it('defaults the trusted branch to refs/heads/main but allows an override', () => {
    const app = new App();
    const stack = new GithubOidcStack(app, 'CustomBranchStack', {
      env: { account: '123456789012', region: 'us-east-1' },
      githubOrgRepo: 'Wgutierrezl/product-checkout-app',
      trustedBranch: 'refs/heads/release',
    });
    const template = Template.fromStack(stack);

    const deployRole = findDeployRole(template);
    const trustStatement = deployRole.AssumeRolePolicyDocument.Statement[0] as {
      Condition: { StringEquals: Record<string, string> };
    };

    expect(trustStatement.Condition.StringEquals['token.actions.githubusercontent.com:sub']).toBe(
      'repo:Wgutierrezl/product-checkout-app:ref:refs/heads/release',
    );
  });
});
