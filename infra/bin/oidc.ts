#!/usr/bin/env node
import 'source-map-support/register';

import { App } from 'aws-cdk-lib';

import { DEFAULT_GITHUB_OIDC_REPO, GithubOidcStack } from '../lib/github-oidc-stack';

/**
 * Separate CDK app entry point, deployed MANUALLY and ONCE by an operator
 * with their own (admin) AWS credentials — never by deploy.yml itself (see
 * github-oidc-stack.ts for why). Kept out of bin/app.ts so a routine
 * `cdk deploy --all` from that app never touches this stack.
 *
 * Usage (see infra/README.md for the full one-time bootstrap sequence):
 *   npx cdk deploy --app "npx ts-node --prefer-ts-exts bin/oidc.ts" GithubOidcStack
 */
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT ?? '000000000000',
  region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
};

const app = new App();

new GithubOidcStack(app, 'GithubOidcStack', {
  env,
  githubOrgRepo: process.env.GITHUB_OIDC_REPO ?? DEFAULT_GITHUB_OIDC_REPO,
});
