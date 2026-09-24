import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';

import { GithubOidcStack } from '../lib/github-oidc-stack';
import { WebStack } from '../lib/web-stack';

/**
 * `WebStack` and `GithubOidcStack` are deployed independently (the latter
 * first, manually, before `WebStack` even exists — see
 * github-oidc-stack.ts). They can only agree on the bucket name because
 * both import the SAME function from shared/web-bucket-name.ts. This test
 * proves that agreement directly from the synthesized templates, rather
 * than trusting that the shared import was actually used correctly in
 * both places — a regression here would silently break `deploy.yml`'s
 * `aws s3 sync` step with an AccessDenied, since the role's policy would
 * scope to a bucket ARN that doesn't match the one WebStack created.
 */
describe('WebStack / GithubOidcStack bucket name consistency', () => {
  it("WebStack's synthesized BucketName is exactly what GithubOidcStack's S3 policy scopes", () => {
    const account = '123456789012';
    const region = 'us-east-1';

    const webApp = new App();
    const webStack = new WebStack(webApp, 'ConsistencyWebStack', { env: { account, region } });
    const webTemplate = Template.fromStack(webStack);
    const [, bucket] = Object.entries(webTemplate.findResources('AWS::S3::Bucket'))[0];
    const actualBucketName: string = bucket.Properties.BucketName;

    const oidcApp = new App();
    const oidcStack = new GithubOidcStack(oidcApp, 'ConsistencyOidcStack', {
      env: { account, region },
      githubOrgRepo: 'Wgutierrezl/product-checkout-app',
    });
    const oidcTemplate = Template.fromStack(oidcStack);
    const policies = oidcTemplate.findResources('AWS::IAM::Policy');
    const s3Statement = Object.values(policies)
      .flatMap((policy) => policy.Properties.PolicyDocument.Statement as Array<{
        Action: unknown;
        Resource: unknown;
      }>)
      .find((statement) =>
        Array.isArray(statement.Action) ? statement.Action.includes('s3:PutObject') : false,
      );

    expect(actualBucketName).toBe('checkout-web-123456789012-us-east-1');
    expect(s3Statement).toBeDefined();
    expect(s3Statement!.Resource).toEqual([
      `arn:aws:s3:::${actualBucketName}`,
      `arn:aws:s3:::${actualBucketName}/*`,
    ]);
  });
});
