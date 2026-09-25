import { createHash } from 'node:crypto';

export interface IntegritySignatureInput {
  reference: string;
  amountInCents: number;
  currency: string;
  integritySecret: string;
}

/**
 * Builds the payment gateway's integrity signature: a hex-encoded SHA256
 * digest of `reference + amountInCents + currency + integritySecret`,
 * concatenated in that exact order (no separators). The secret must never be
 * sent to the client — this signature travels with the transaction request
 * instead so the gateway can verify the amount/reference weren't tampered
 * with client-side.
 */
export function buildIntegritySignature(input: IntegritySignatureInput): string {
  const concatenated = `${input.reference}${input.amountInCents}${input.currency}${input.integritySecret}`;
  return createHash('sha256').update(concatenated).digest('hex');
}
