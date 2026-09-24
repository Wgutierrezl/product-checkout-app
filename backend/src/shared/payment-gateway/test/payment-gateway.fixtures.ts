import { AppResultAsync, okAsync } from '../../result/result.types';
import { PaymentGatewayPort } from '../domain/payment-gateway.port';
import {
  AcceptanceTokens,
  CreateCardTransactionInput,
  GatewayTransactionResult,
} from '../domain/payment-gateway.types';

/**
 * Shared test fixtures for use-case specs across every module that depends
 * on `PaymentGatewayPort` (payment-acceptance today; transactions in
 * PR5/PR6). Test-only: never imported from production code.
 */

export function buildAcceptanceTokens(overrides: Partial<AcceptanceTokens> = {}): AcceptanceTokens {
  return {
    acceptanceToken: { token: 'acc-token-1', permalink: 'https://gateway.test/acceptance' },
    acceptPersonalAuth: {
      token: 'auth-token-1',
      permalink: 'https://gateway.test/personal-data-auth',
    },
    ...overrides,
  };
}

export function buildGatewayTransactionResult(
  overrides: Partial<GatewayTransactionResult> = {},
): GatewayTransactionResult {
  return { gatewayTransactionId: 'gw-tx-1', status: 'PENDING', ...overrides };
}

export class FakePaymentGatewayPort implements PaymentGatewayPort {
  constructor(
    private readonly acceptanceTokens: AcceptanceTokens = buildAcceptanceTokens(),
    private readonly transactionResult: GatewayTransactionResult = buildGatewayTransactionResult(),
  ) {}

  getAcceptanceTokens(): AppResultAsync<AcceptanceTokens> {
    return okAsync(this.acceptanceTokens);
  }

  createCardTransaction(_input: CreateCardTransactionInput): AppResultAsync<GatewayTransactionResult> {
    return okAsync(this.transactionResult);
  }

  getTransaction(_gatewayTransactionId: string): AppResultAsync<GatewayTransactionResult> {
    return okAsync(this.transactionResult);
  }

  getTransactionByReference(_reference: string): AppResultAsync<GatewayTransactionResult | null> {
    return okAsync(this.transactionResult);
  }
}
