import { webBucketArn, webBucketName } from '../../lib/shared/web-bucket-name';

describe('webBucketName', () => {
  it('combines the checkout-web prefix with account and region for global uniqueness', () => {
    expect(webBucketName('123456789012', 'us-east-1')).toBe('checkout-web-123456789012-us-east-1');
  });

  it('changes when the region changes, keeping names unique per region', () => {
    expect(webBucketName('123456789012', 'eu-west-1')).toBe('checkout-web-123456789012-eu-west-1');
  });
});

describe('webBucketArn', () => {
  it('wraps webBucketName in a valid S3 bucket ARN', () => {
    expect(webBucketArn('123456789012', 'us-east-1')).toBe(
      'arn:aws:s3:::checkout-web-123456789012-us-east-1',
    );
  });
});
