import { CfnOutput, Duration, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import {
  Distribution,
  HeadersFrameOption,
  HeadersReferrerPolicy,
  ResponseHeadersPolicy,
  ViewerProtocolPolicy,
} from 'aws-cdk-lib/aws-cloudfront';
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { BlockPublicAccess, Bucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

import { webBucketName } from './shared/web-bucket-name';

/** Generic placeholder — never the payment gateway company's name/domain. */
const DEFAULT_PAYMENT_GATEWAY_SANDBOX_ORIGIN = 'https://payment-gateway-sandbox.invalid';

/**
 * S3 (private, OAC-only) + CloudFront SPA hosting.
 *
 * No dependency on `ApiStack` here, by design: `ApiStack` depends on
 * `WebStack` (for the CORS origin), so `WebStack` depending back on
 * `ApiStack`'s exact API URL would create a circular stack dependency,
 * which CloudFormation/CDK cannot deploy. Instead, the CSP's `connect-src`
 * allows the wildcard HTTP API domain pattern
 * `https://*.execute-api.<region>.amazonaws.com` — every HTTP API in this
 * account/region matches it, but no other origin does, so this is still a
 * meaningful restriction (not `*`), just resolved one level less precisely
 * than the exact API id.
 */
export class WebStack extends Stack {
  public readonly bucket: Bucket;
  public readonly distribution: Distribution;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    this.bucket = new Bucket(this, 'SpaBucket', {
      // Pinned (not CDK-auto-generated) so GithubOidcStack's S3 policy —
      // deployed separately, before this stack exists on a fresh account —
      // can reference the exact bucket ARN. Single source of truth in
      // shared/web-bucket-name.ts; see web-stack-oidc-consistency.test.ts.
      bucketName: webBucketName(this.account, this.region),
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const apiOriginPattern = `https://*.execute-api.${this.region}.amazonaws.com`;
    const gatewaySandboxOrigin =
      process.env.PAYMENT_GATEWAY_SANDBOX_ORIGIN ?? DEFAULT_PAYMENT_GATEWAY_SANDBOX_ORIGIN;
    const contentSecurityPolicy = [
      "default-src 'self'",
      `connect-src 'self' ${apiOriginPattern} ${gatewaySandboxOrigin}`,
      "img-src 'self' data: https://images.unsplash.com",
      // 'unsafe-inline' is required by Vite's dev-time injected styles and
      // several component libraries; Google Fonts' stylesheet host is
      // allow-listed alongside it for web font loading.
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "frame-ancestors 'none'",
      // Hardening trio: no <base> tag hijacking, no cross-origin form
      // submission, no legacy plugin content (Flash/Java/etc).
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; ');

    const securityHeadersPolicy = new ResponseHeadersPolicy(this, 'SecurityHeadersPolicy', {
      responseHeadersPolicyName: 'checkout-web-security-headers',
      securityHeadersBehavior: {
        contentSecurityPolicy: { contentSecurityPolicy, override: true },
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: HeadersFrameOption.DENY, override: true },
        referrerPolicy: {
          referrerPolicy: HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
        strictTransportSecurity: {
          accessControlMaxAge: Duration.days(365),
          includeSubdomains: true,
          override: true,
        },
      },
    });

    this.distribution = new Distribution(this, 'Distribution', {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy: securityHeadersPolicy,
      },
      // Both 403 (OAC without s3:ListBucket surfaces missing keys as 403,
      // not just 404) and 404 rewrite to the SPA shell so client-side
      // routing (e.g. /products/abc) works on a hard refresh. index.html's
      // own no-cache behavior is set via the S3 object's Cache-Control
      // header at upload time in the deploy workflow (`s3 sync` step),
      // NOT via a separate CloudFront cache behavior — a single
      // origin-wide cache policy is enough since CloudFront honors the
      // origin's Cache-Control within the policy's min/max TTL bounds.
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html' },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html' },
      ],
    });

    new CfnOutput(this, 'DistributionDomain', { value: this.distribution.distributionDomainName });
    new CfnOutput(this, 'BucketName', { value: this.bucket.bucketName });
    new CfnOutput(this, 'DistributionId', { value: this.distribution.distributionId });
  }
}
