import { CfnOutput, Duration, Stack, StackProps } from 'aws-cdk-lib';
import {
  Effect,
  OpenIdConnectPrincipal,
  OpenIdConnectProvider,
  PolicyStatement,
  Role,
} from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

const GITHUB_OIDC_ISSUER_URL = 'https://token.actions.githubusercontent.com';
const DEFAULT_TRUSTED_BRANCH = 'refs/heads/main';
/** Default CDK v2 bootstrap qualifier — must match whatever `cdk bootstrap` used for this account/region. */
const CDK_BOOTSTRAP_QUALIFIER = 'hnb659fds';
/** Matches WebStack's SPA bucket name (see web-stack.ts) — kept in sync manually since this stack is deployed independently, before WebStack exists. */
const WEB_BUCKET_NAME_PREFIX = 'checkout-web';
/** Matches DataStack's Products table name (see data-stack.ts). */
const PRODUCTS_TABLE_NAME = 'Products';

export interface GithubOidcStackProps extends StackProps {
  /** `<org>/<repo>`, e.g. `Wgutierrezl/product-checkout-app`. */
  readonly githubOrgRepo: string;
  /** @default 'refs/heads/main' */
  readonly trustedBranch?: string;
}

/**
 * One-time bootstrap stack: deployed manually, ONCE, with an operator's own
 * (admin) AWS credentials — NOT part of `bin/app.ts`'s normal deploy DAG,
 * and NEVER deployed by `deploy.yml` itself. This is intentional: `deploy.yml`
 * authenticates AS the role this stack creates, so the role must already
 * exist before any OIDC-authenticated deploy can run (chicken-and-egg).
 *
 * Creates the GitHub Actions OIDC provider and a deploy role trusted ONLY
 * for this exact repo on `refs/heads/main` (or an overridden branch), with
 * a policy scoped to exactly what `deploy.yml` needs: assuming the CDK
 * bootstrap roles (so `cdk deploy` can act), syncing the SPA bucket,
 * invalidating the CloudFront distribution, and seeding the Products table.
 *
 * Resource ARNs are constructed from known naming conventions rather than
 * cross-stack references, since this stack is deployed BEFORE
 * DataStack/WebStack/ApiStack exist on a fresh account. `WebStack`'s bucket
 * name and `DataStack`'s Products table name must stay in sync with the
 * constants above if ever renamed.
 */
export class GithubOidcStack extends Stack {
  public readonly deployRole: Role;

  constructor(scope: Construct, id: string, props: GithubOidcStackProps) {
    super(scope, id, props);

    const trustedBranch = props.trustedBranch ?? DEFAULT_TRUSTED_BRANCH;

    const provider = new OpenIdConnectProvider(this, 'GithubOidcProvider', {
      url: GITHUB_OIDC_ISSUER_URL,
      clientIds: ['sts.amazonaws.com'],
    });

    this.deployRole = new Role(this, 'DeployRole', {
      roleName: 'checkout-deploy',
      assumedBy: new OpenIdConnectPrincipal(provider, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          'token.actions.githubusercontent.com:sub': `repo:${props.githubOrgRepo}:ref:${trustedBranch}`,
        },
      }),
      maxSessionDuration: Duration.hours(1),
    });

    this.deployRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['sts:AssumeRole'],
        resources: [
          `arn:aws:iam::${this.account}:role/cdk-${CDK_BOOTSTRAP_QUALIFIER}-*-role-${this.account}-${this.region}`,
        ],
      }),
    );

    this.deployRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['s3:PutObject', 's3:DeleteObject', 's3:ListBucket'],
        resources: [
          `arn:aws:s3:::${WEB_BUCKET_NAME_PREFIX}-${this.account}`,
          `arn:aws:s3:::${WEB_BUCKET_NAME_PREFIX}-${this.account}/*`,
        ],
      }),
    );

    this.deployRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['cloudfront:CreateInvalidation'],
        // CloudFront distribution IDs are AWS-generated and unknowable
        // before first deploy (no custom-ID support) — account-scoped
        // wildcard is the least-privilege option available, not a global `*`.
        resources: [`arn:aws:cloudfront::${this.account}:distribution/*`],
      }),
    );

    this.deployRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['dynamodb:PutItem'],
        resources: [`arn:aws:dynamodb:${this.region}:${this.account}:table/${PRODUCTS_TABLE_NAME}`],
      }),
    );

    new CfnOutput(this, 'DeployRoleArn', { value: this.deployRole.roleArn });
  }
}
