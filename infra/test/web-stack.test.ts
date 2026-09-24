import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';

import { WebStack } from '../lib/web-stack';

function synthWebStack(): Template {
  const app = new App();
  const stack = new WebStack(app, 'TestWebStack', {
    env: { account: '123456789012', region: 'us-east-1' },
  });
  return Template.fromStack(stack);
}

describe('WebStack', () => {
  it('blocks all public access on the SPA bucket', () => {
    const template = synthWebStack();

    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  it('grants bucket read access only to the CloudFront OAC principal, scoped to this distribution', () => {
    const template = synthWebStack();

    template.hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Allow',
            Principal: { Service: 'cloudfront.amazonaws.com' },
            Action: 's3:GetObject',
            Condition: Match.objectLike({
              StringEquals: Match.objectLike({
                'AWS:SourceArn': Match.anyValue(),
              }),
            }),
          }),
        ]),
      }),
    });
  });

  it('enforces SSL-only access on the bucket (denies non-HTTPS requests)', () => {
    const template = synthWebStack();

    template.hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Deny',
            Principal: { AWS: '*' },
            Condition: { Bool: { 'aws:SecureTransport': 'false' } },
          }),
        ]),
      }),
    });
  });

  it('redirects HTTP to HTTPS and sets index.html as the default root object', () => {
    const template = synthWebStack();

    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        DefaultRootObject: 'index.html',
        DefaultCacheBehavior: Match.objectLike({
          ViewerProtocolPolicy: 'redirect-to-https',
        }),
      }),
    });
  });

  it('maps both 403 and 404 to /index.html with HTTP 200 (SPA client-side routing)', () => {
    const template = synthWebStack();

    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        CustomErrorResponses: Match.arrayWith([
          Match.objectLike({
            ErrorCode: 403,
            ResponseCode: 200,
            ResponsePagePath: '/index.html',
          }),
          Match.objectLike({
            ErrorCode: 404,
            ResponseCode: 200,
            ResponsePagePath: '/index.html',
          }),
        ]),
      }),
    });
  });

  it('attaches a security headers policy with HSTS and the required CSP directives', () => {
    const template = synthWebStack();

    const policies = template.findResources('AWS::CloudFront::ResponseHeadersPolicy');
    const [, policy] = Object.entries(policies)[0];
    const securityHeaders =
      policy.Properties.ResponseHeadersPolicyConfig.SecurityHeadersConfig;

    expect(securityHeaders.StrictTransportSecurity).toEqual(
      expect.objectContaining({ AccessControlMaxAgeSec: expect.any(Number), Override: true }),
    );
    expect(securityHeaders.StrictTransportSecurity.AccessControlMaxAgeSec).toBeGreaterThan(0);
    expect(securityHeaders.ContentTypeOptions).toEqual({ Override: true });
    expect(securityHeaders.FrameOptions).toEqual({ FrameOption: 'DENY', Override: true });
    expect(securityHeaders.ReferrerPolicy).toEqual({
      ReferrerPolicy: 'strict-origin-when-cross-origin',
      Override: true,
    });

    // Exact match (not just `toContain`) so a dropped/malformed directive
    // fails loudly instead of slipping through a partial-substring check.
    const csp: string = securityHeaders.ContentSecurityPolicy.ContentSecurityPolicy;
    expect(csp).toBe(
      [
        "default-src 'self'",
        "connect-src 'self' https://*.execute-api.us-east-1.amazonaws.com https://payment-gateway-sandbox.invalid",
        "img-src 'self' data: https://images.unsplash.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "object-src 'none'",
      ].join('; '),
    );
  });

  it('includes the payment gateway sandbox origin in connect-src from env, with a safe placeholder default', () => {
    const template = synthWebStack();

    const policies = template.findResources('AWS::CloudFront::ResponseHeadersPolicy');
    const [, policy] = Object.entries(policies)[0];
    const csp: string =
      policy.Properties.ResponseHeadersPolicyConfig.SecurityHeadersConfig.ContentSecurityPolicy
        .ContentSecurityPolicy;

    expect(csp).toMatch(/connect-src[^;]*payment-gateway-sandbox\.invalid/);
  });

  it('outputs the distribution domain, bucket name, and distribution id', () => {
    const template = synthWebStack();

    template.hasOutput('DistributionDomain', {});
    template.hasOutput('BucketName', {});
    template.hasOutput('DistributionId', {});
  });
});
