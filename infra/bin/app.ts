#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as path from 'node:path';

import 'source-map-support/register';

import { App } from 'aws-cdk-lib';

import { ApiStack } from '../lib/api-stack';
import { DataStack } from '../lib/data-stack';
import { WebStack } from '../lib/web-stack';

/**
 * Account/region resolve from env with offline-safe fallbacks so `cdk synth`
 * never triggers an `aws sts get-caller-identity` lookup. Real values come
 * from the OIDC-assumed role's credentials in the deploy workflow.
 */
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT ?? '000000000000',
  region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
};

const BACKEND_DIR = path.join(__dirname, '../../backend');
const LAMBDA_ASSET_PATH = path.join(BACKEND_DIR, 'dist-lambda');

/**
 * `Code.fromAsset` needs a real local directory to hash at synth time. On a
 * fresh checkout (or after `rm -rf backend/dist-lambda`) it doesn't exist
 * yet — build it on demand so `cdk synth`/`cdk deploy` work standalone,
 * without a separate manual step. `.github/workflows/ci.yml` already runs
 * `package:lambda` explicitly before invoking `cdk synth`, so this is a
 * no-op there; it only does real work for local/first-time runs. Assumes
 * `backend`'s own dependencies are already installed (`npm ci`), same
 * assumption CI makes.
 */
function ensureLambdaAssetBuilt(): void {
  if (existsSync(LAMBDA_ASSET_PATH)) return;
  execSync('npm run package:lambda', { cwd: BACKEND_DIR, stdio: 'inherit' });
}

ensureLambdaAssetBuilt();

const app = new App();

const dataStack = new DataStack(app, 'DataStack', { env });
const webStack = new WebStack(app, 'WebStack', { env });

const apiStack = new ApiStack(app, 'ApiStack', {
  env,
  productsTable: dataStack.productsTable,
  customersTable: dataStack.customersTable,
  deliveriesTable: dataStack.deliveriesTable,
  transactionsTable: dataStack.transactionsTable,
  webStackDomain: webStack.distribution.distributionDomainName,
  lambdaAssetPath: LAMBDA_ASSET_PATH,
});
// `addDependency` is deprecated in favor of `addStackDependency`. ApiStack
// needs both: DataStack's tables (IAM grants + env vars) and WebStack's
// distribution domain (CORS) — CDK computes the deploy DAG from these,
// independent of declaration order above.
apiStack.addStackDependency(dataStack);
apiStack.addStackDependency(webStack);
