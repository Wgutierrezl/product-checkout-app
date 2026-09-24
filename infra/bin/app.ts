#!/usr/bin/env node
import 'source-map-support/register';

import { App } from 'aws-cdk-lib';

import { DataStack } from '../lib/data-stack';

/**
 * Account/region resolve from env with offline-safe fallbacks so `cdk synth`
 * never triggers an `aws sts get-caller-identity` lookup. Real values come
 * from the OIDC-assumed role's credentials in the deploy workflow.
 */
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT ?? '000000000000',
  region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
};

const app = new App();

new DataStack(app, 'DataStack', { env });
