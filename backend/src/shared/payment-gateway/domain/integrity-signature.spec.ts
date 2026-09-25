import { buildIntegritySignature } from './integrity-signature';

describe('buildIntegritySignature', () => {
  it('matches a known SHA256 vector (reference + amountInCents + currency + secret, hex digest)', () => {
    const signature = buildIntegritySignature({
      reference: 'test-ref-1',
      amountInCents: 1_000_000,
      currency: 'COP',
      integritySecret: 'test_integrity_secret',
    });

    expect(signature).toBe('4f21a0b7caa57dc092895e3821f8c9e6aca3304797c5f642fbfbd0c835ddfa3f');
  });

  it('produces a different signature for a different reference/amount (triangulation)', () => {
    const signature = buildIntegritySignature({
      reference: 'test-ref-2',
      amountInCents: 2_500_000,
      currency: 'COP',
      integritySecret: 'test_integrity_secret',
    });

    expect(signature).toBe('152889eb762061259a768b250a30a3fde3b4939e9d98ec6b5b84c3eebdfc5b23');
  });

  it('produces a different signature when only the secret changes', () => {
    const base = buildIntegritySignature({
      reference: 'test-ref-1',
      amountInCents: 1_000_000,
      currency: 'COP',
      integritySecret: 'test_integrity_secret',
    });
    const withDifferentSecret = buildIntegritySignature({
      reference: 'test-ref-1',
      amountInCents: 1_000_000,
      currency: 'COP',
      integritySecret: 'another_secret',
    });

    expect(withDifferentSecret).not.toBe(base);
  });

  it('always returns a 64-character lowercase hex string', () => {
    const signature = buildIntegritySignature({
      reference: 'ref',
      amountInCents: 1,
      currency: 'COP',
      integritySecret: 'secret',
    });

    expect(signature).toMatch(/^[0-9a-f]{64}$/);
  });
});
