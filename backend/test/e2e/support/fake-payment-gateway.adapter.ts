import { Injectable } from '@nestjs/common';

import { AppResultAsync, okAsync } from '../../../src/shared/result/result.types';
import { PaymentGatewayPort } from '../../../src/shared/payment-gateway/domain/payment-gateway.port';
import {
  AcceptanceTokens,
  CreateCardTransactionInput,
  GatewayTransactionResult,
} from '../../../src/shared/payment-gateway/domain/payment-gateway.types';

/**
 * Deterministic, no-network fake for the E2E suite — the real gateway is
 * never called from here. `cardToken` alone decides the synchronous outcome:
 *
 * - `DECLINED_CARD_TOKEN` -> the gateway CALL succeeds but synchronously
 *   reports DECLINED (no polling needed, mirrors a business rejection).
 * - Any other token (see `APPROVED_CARD_TOKEN`) -> the gateway CALL succeeds
 *   but synchronously reports PENDING (mirrors the real sandbox's observed
 *   behavior, which returns PENDING first), then resolves to
 *   APPROVED on the FIRST poll (`getTransaction`/`getTransactionByReference`)
 *   so the test's lazy-poll loop exercises the real polling code path.
 */
export const APPROVED_CARD_TOKEN = 'tok_test_e2e_approved';
export const DECLINED_CARD_TOKEN = 'tok_test_e2e_declined';

interface PendingRecord {
  gatewayTransactionId: string;
}

@Injectable()
export class FakePaymentGatewayAdapter implements PaymentGatewayPort {
  private readonly byGatewayId = new Map<string, PendingRecord>();
  private readonly byReference = new Map<string, PendingRecord>();

  /** Exposed for tests to assert the gateway was (or wasn't) called again on an idempotent replay. */
  createCardTransactionCalls = 0;

  getAcceptanceTokens(): AppResultAsync<AcceptanceTokens> {
    return okAsync({
      acceptanceToken: { token: 'e2e-acceptance-token', permalink: 'https://gateway.e2e.test/acceptance' },
      acceptPersonalAuth: {
        token: 'e2e-personal-auth-token',
        permalink: 'https://gateway.e2e.test/personal-data-auth',
      },
    });
  }

  createCardTransaction(input: CreateCardTransactionInput): AppResultAsync<GatewayTransactionResult> {
    this.createCardTransactionCalls += 1;
    const gatewayTransactionId = `gw-${input.reference}`;

    if (input.cardToken === DECLINED_CARD_TOKEN) {
      return okAsync({ gatewayTransactionId, status: 'DECLINED' });
    }

    const record: PendingRecord = { gatewayTransactionId };
    this.byGatewayId.set(gatewayTransactionId, record);
    this.byReference.set(input.reference, record);
    return okAsync({ gatewayTransactionId, status: 'PENDING' });
  }

  getTransaction(gatewayTransactionId: string): AppResultAsync<GatewayTransactionResult> {
    const record = this.byGatewayId.get(gatewayTransactionId);
    if (!record) {
      return okAsync({ gatewayTransactionId, status: 'PENDING' });
    }
    return okAsync({ gatewayTransactionId: record.gatewayTransactionId, status: 'APPROVED' });
  }

  getTransactionByReference(reference: string): AppResultAsync<GatewayTransactionResult | null> {
    const record = this.byReference.get(reference);
    if (!record) {
      return okAsync(null);
    }
    return okAsync({ gatewayTransactionId: record.gatewayTransactionId, status: 'APPROVED' });
  }
}
