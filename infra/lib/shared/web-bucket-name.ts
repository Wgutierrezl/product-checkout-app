/**
 * Deterministic SPA bucket name, shared between `WebStack` (which creates
 * the bucket) and `GithubOidcStack` (whose S3 policy must scope to it
 * before `WebStack` even exists, on a fresh account). A single source of
 * truth here means the two stacks can never drift apart — CDK generates a
 * unique default bucket physical name otherwise, which `GithubOidcStack`
 * (deployed separately, first) has no way to predict or reference.
 *
 * S3 bucket names are globally unique across ALL AWS accounts, so both
 * account and region are included.
 */
export function webBucketName(account: string, region: string): string {
  return `checkout-web-${account}-${region}`;
}

export function webBucketArn(account: string, region: string): string {
  return `arn:aws:s3:::${webBucketName(account, region)}`;
}
