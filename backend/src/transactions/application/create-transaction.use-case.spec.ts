import { Logger } from '@nestjs/common';

import { buildDelivery, FakeDeliveryRepository } from '../../deliveries/test/delivery.fixtures';
import { DomainError, NotFoundError, PaymentGatewayError, UnexpectedError } from '../../shared/errors/domain-error';
import { ClockPort } from '../../shared/ports/clock.port';
import { IdGeneratorPort } from '../../shared/ports/id-generator.port';
import { buildIntegritySignature } from '../../shared/payment-gateway/domain/integrity-signature';
import { AppResultAsync, errAsync, okAsync } from '../../shared/result/result.types';
import { PaymentGatewayPort } from '../../shared/payment-gateway/domain/payment-gateway.port';
import { CreateCardTransactionInput, GatewayTransactionResult } from '../../shared/payment-gateway/domain/payment-gateway.types';
import { buildCustomer, FakeCustomerRepository } from '../../customers/test/customer.fixtures';
import { buildProduct, FakeProductRepository } from '../../products/test/product.fixtures';
import { Stock } from '../../products/domain/value-objects/stock.vo';
import { Transaction } from '../domain/transaction.entity';
import { FinalizeNonApprovedInput, SettleApprovedInput, UpdateGatewayResultInput } from '../domain/transaction.repository.port';
import { buildTransaction, FakeTransactionRepository } from '../test/transaction.fixtures';
import { CreateTransactionCommand, CreateTransactionUseCase } from './create-transaction.use-case';
import { SettleTransactionUseCase } from './settle-transaction.use-case';

function buildFakeClock(initialTimeMs: number): ClockPort {
  return { now: () => new Date(initialTimeMs) };
}

class SequentialIdGenerator implements IdGeneratorPort {
  private idCallCount = 0;

  newId(): string {
    this.idCallCount += 1;
    return `generated-id-${this.idCallCount}`;
  }

  newReference(): string {
    return 'REF-generated';
  }
}

class RecordingGatewayPort implements PaymentGatewayPort {
  public lastCreateCardTransactionInput: CreateCardTransactionInput | undefined;

  constructor(
    private readonly createResult:
      | { ok: true; value: GatewayTransactionResult }
      | { ok: false; error: PaymentGatewayError },
  ) {}

  getAcceptanceTokens(): never {
    throw new Error('not used in this suite');
  }

  createCardTransaction(input: CreateCardTransactionInput): AppResultAsync<GatewayTransactionResult> {
    this.lastCreateCardTransactionInput = input;
    return this.createResult.ok ? okAsync(this.createResult.value) : errAsync(this.createResult.error);
  }

  getTransaction(): never {
    throw new Error('not used in this suite');
  }

  getTransactionByReference(): never {
    throw new Error('not used in this suite');
  }
}

/**
 * Wraps a real `FakeTransactionRepository` but lets a test queue scripted
 * outcomes for `updateGatewayResult`/`settleApproved`/`finalizeNonApproved`
 * (consumed in call order) before falling back to the real delegate — used
 * to simulate a transient DB failure followed by a successful retry, or a
 * persistent failure.
 */
class FlakyTransactionRepository extends FakeTransactionRepository {
  private readonly updateGatewayResultQueue: Array<() => AppResultAsync<Transaction>> = [];
  private readonly settleApprovedQueue: Array<() => AppResultAsync<Transaction>> = [];
  private readonly finalizeNonApprovedQueue: Array<() => AppResultAsync<Transaction>> = [];

  queueUpdateGatewayResultFailure(error: DomainError): void {
    this.updateGatewayResultQueue.push(() => errAsync(error));
  }

  queueSettleApprovedFailure(error: DomainError): void {
    this.settleApprovedQueue.push(() => errAsync(error));
  }

  queueFinalizeNonApprovedFailure(error: DomainError): void {
    this.finalizeNonApprovedQueue.push(() => errAsync(error));
  }

  updateGatewayResult(id: string, input: UpdateGatewayResultInput): AppResultAsync<Transaction> {
    const next = this.updateGatewayResultQueue.shift();
    return next ? next() : super.updateGatewayResult(id, input);
  }

  settleApproved(input: SettleApprovedInput): AppResultAsync<Transaction> {
    const next = this.settleApprovedQueue.shift();
    return next ? next() : super.settleApproved(input);
  }

  finalizeNonApproved(input: FinalizeNonApprovedInput): AppResultAsync<Transaction> {
    const next = this.finalizeNonApprovedQueue.shift();
    return next ? next() : super.finalizeNonApproved(input);
  }
}

const IDEMPOTENCY_KEY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function buildCommand(overrides: Partial<CreateTransactionCommand> = {}): CreateTransactionCommand {
  return {
    idempotencyKey: IDEMPOTENCY_KEY,
    productId: 'prod-1',
    quantity: 2,
    customer: { fullName: 'Jane Doe', email: 'jane.doe@example.com', phone: '+573001234567' },
    delivery: { address: 'Cra 1 # 2-3', city: 'Bogota', region: 'Cundinamarca' },
    cardToken: 'tok_test_card',
    installments: 1,
    acceptanceToken: 'acc-token-1',
    acceptPersonalAuth: 'auth-token-1',
    ...overrides,
  };
}

const FEES = { baseFeeCents: 250_000, deliveryFeeCents: 800_000 };
const INTEGRITY_SECRET = 'integrity-secret';

function buildUseCase(options: {
  products?: FakeProductRepository;
  customers?: FakeCustomerRepository;
  transactions?: FakeTransactionRepository;
  deliveries?: FakeDeliveryRepository;
  gateway: PaymentGatewayPort;
  clock?: ClockPort;
  ids?: IdGeneratorPort;
}) {
  const transactions = options.transactions ?? new FakeTransactionRepository();
  const clock = options.clock ?? buildFakeClock(0);
  const ids = options.ids ?? new SequentialIdGenerator();
  const settleTransaction = new SettleTransactionUseCase(transactions, ids, clock);

  return new CreateTransactionUseCase(
    options.products ?? new FakeProductRepository([buildProduct({ id: 'prod-1', stock: Stock.create(10)._unsafeUnwrap() })]),
    options.customers ?? new FakeCustomerRepository(),
    transactions,
    options.deliveries ?? new FakeDeliveryRepository(),
    options.gateway,
    settleTransaction,
    clock,
    ids,
    FEES,
    INTEGRITY_SECRET,
  );
}

describe('CreateTransactionUseCase', () => {
  it('creates a PENDING transaction, charges the gateway, and stores the returned status', async () => {
    const gateway = new RecordingGatewayPort({ ok: true, value: { gatewayTransactionId: 'gw-1', status: 'APPROVED' } });
    const transactions = new FakeTransactionRepository();
    const useCase = buildUseCase({ transactions, gateway });

    const result = await useCase.execute(buildCommand());

    expect(result.isOk()).toBe(true);
    const { transaction } = result._unsafeUnwrap();
    expect(transaction.status).toBe('APPROVED');
    expect(transaction.gatewayTransactionId).toBe('gw-1');
    expect(transaction.totalAmount.valueInCents).toBe(150_000 * 2 + 250_000 + 800_000);
  });

  it('routes a synchronous APPROVED gateway result through SettleTransaction (stock decrement + delivery)', async () => {
    const gateway = new RecordingGatewayPort({ ok: true, value: { gatewayTransactionId: 'gw-1', status: 'APPROVED' } });
    const transactions = new FakeTransactionRepository();
    const useCase = buildUseCase({ transactions, gateway });

    const result = await useCase.execute(buildCommand());

    expect(result.isOk()).toBe(true);
    expect(transactions.settleApprovedCalls).toHaveLength(1);
    expect(transactions.settleApprovedCalls[0]).toMatchObject({
      transactionId: IDEMPOTENCY_KEY,
      productId: 'prod-1',
      gatewayTransactionId: 'gw-1',
    });
  });

  it('embeds the delivery in the response when the synchronous result is APPROVED', async () => {
    const gateway = new RecordingGatewayPort({ ok: true, value: { gatewayTransactionId: 'gw-1', status: 'APPROVED' } });
    const delivery = buildDelivery({ transactionId: IDEMPOTENCY_KEY });
    const deliveries = new FakeDeliveryRepository([delivery]);
    const useCase = buildUseCase({ gateway, deliveries });

    const result = await useCase.execute(buildCommand());

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().delivery).toEqual(delivery);
  });

  it('does not embed a delivery when the synchronous result is not APPROVED', async () => {
    const gateway = new RecordingGatewayPort({ ok: true, value: { gatewayTransactionId: 'gw-1', status: 'PENDING' } });
    const useCase = buildUseCase({ gateway });

    const result = await useCase.execute(buildCommand());

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().delivery).toBeNull();
  });

  it('does NOT route a synchronous DECLINED gateway result through settleApproved', async () => {
    const gateway = new RecordingGatewayPort({ ok: true, value: { gatewayTransactionId: 'gw-1', status: 'DECLINED' } });
    const transactions = new FakeTransactionRepository();
    const useCase = buildUseCase({ transactions, gateway });

    await useCase.execute(buildCommand());

    expect(transactions.settleApprovedCalls).toHaveLength(0);
  });

  it('routes a synchronous PENDING gateway result through SettleTransaction too (no unconditioned write)', async () => {
    const gateway = new RecordingGatewayPort({ ok: true, value: { gatewayTransactionId: 'gw-1', status: 'PENDING' } });
    const transactions = new FakeTransactionRepository();
    const useCase = buildUseCase({ transactions, gateway });

    const result = await useCase.execute(buildCommand());

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().transaction.status).toBe('PENDING');
    expect(result._unsafeUnwrap().transaction.gatewayTransactionId).toBe('gw-1');
  });

  it('creates a new customer when none exists for the given email', async () => {
    const customers = new FakeCustomerRepository();
    const useCase = buildUseCase({
      customers,
      gateway: new RecordingGatewayPort({ ok: true, value: { gatewayTransactionId: 'gw-1', status: 'PENDING' } }),
    });

    await useCase.execute(buildCommand());

    const found = await customers.findByEmail('jane.doe@example.com');
    expect(found._unsafeUnwrap()).toMatchObject({ email: 'jane.doe@example.com', fullName: 'Jane Doe' });
  });

  it('reuses an existing customer by email instead of creating a duplicate', async () => {
    const existing = buildCustomer({ id: 'cust-existing', email: 'jane.doe@example.com' });
    const customers = new FakeCustomerRepository([existing]);
    const transactions = new FakeTransactionRepository();
    const useCase = buildUseCase({
      customers,
      transactions,
      gateway: new RecordingGatewayPort({ ok: true, value: { gatewayTransactionId: 'gw-1', status: 'PENDING' } }),
    });

    const result = await useCase.execute(buildCommand());

    expect(result._unsafeUnwrap().transaction.customerId).toBe('cust-existing');
  });

  it('returns NotFoundError for an unknown product and makes no gateway call', async () => {
    const gateway = new RecordingGatewayPort({ ok: true, value: { gatewayTransactionId: 'gw-1', status: 'PENDING' } });
    const transactions = new FakeTransactionRepository();
    const useCase = buildUseCase({ products: new FakeProductRepository([]), transactions, gateway });

    const result = await useCase.execute(buildCommand({ productId: 'unknown-product' }));

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().type).toBe('NotFound');
    expect(gateway.lastCreateCardTransactionInput).toBeUndefined();
  });

  it('returns ValidationError for a non-positive quantity and makes no gateway call', async () => {
    const gateway = new RecordingGatewayPort({ ok: true, value: { gatewayTransactionId: 'gw-1', status: 'PENDING' } });
    const useCase = buildUseCase({ gateway });

    const result = await useCase.execute(buildCommand({ quantity: 0 }));

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().type).toBe('Validation');
    expect(gateway.lastCreateCardTransactionInput).toBeUndefined();
  });

  it('returns InsufficientStockError when quantity exceeds available stock and makes no gateway call', async () => {
    const gateway = new RecordingGatewayPort({ ok: true, value: { gatewayTransactionId: 'gw-1', status: 'PENDING' } });
    const products = new FakeProductRepository([buildProduct({ id: 'prod-1', stock: Stock.create(1)._unsafeUnwrap() })]);
    const transactions = new FakeTransactionRepository();
    const useCase = buildUseCase({ products, transactions, gateway });

    const result = await useCase.execute(buildCommand({ quantity: 5 }));

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().type).toBe('InsufficientStock');
    expect(gateway.lastCreateCardTransactionInput).toBeUndefined();
  });

  describe('gateway CALL failure classification (definite vs ambiguous)', () => {
    it('marks the transaction ERROR and propagates the error for a DEFINITE gateway rejection (ambiguous: false)', async () => {
      const gatewayError = new PaymentGatewayError('Payment gateway request failed: 422', false);
      const gateway = new RecordingGatewayPort({ ok: false, error: gatewayError });
      const transactions = new FakeTransactionRepository();
      const useCase = buildUseCase({ transactions, gateway });

      const result = await useCase.execute(buildCommand());

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr()).toBe(gatewayError);
      const stored = await transactions.findById(IDEMPOTENCY_KEY);
      expect(stored._unsafeUnwrap().status).toBe('ERROR');
    });

    it('leaves the transaction PENDING (no gatewayTransactionId) and resolves Ok for an AMBIGUOUS gateway failure (ambiguous: true)', async () => {
      const gatewayError = new PaymentGatewayError('Payment gateway request failed: timeout', true);
      const gateway = new RecordingGatewayPort({ ok: false, error: gatewayError });
      const transactions = new FakeTransactionRepository();
      const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
      const useCase = buildUseCase({ transactions, gateway });

      const result = await useCase.execute(buildCommand());

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().transaction.status).toBe('PENDING');
      expect(result._unsafeUnwrap().transaction.gatewayTransactionId).toBeUndefined();
      const stored = await transactions.findById(IDEMPOTENCY_KEY);
      expect(stored._unsafeUnwrap().status).toBe('PENDING');
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Ambiguous'));
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining(IDEMPOTENCY_KEY));
      errorSpy.mockRestore();
    });

    it('never calls settleApproved/finalizeNonApproved for an ambiguous failure', async () => {
      const gatewayError = new PaymentGatewayError('timeout', true);
      const gateway = new RecordingGatewayPort({ ok: false, error: gatewayError });
      const transactions = new FakeTransactionRepository();
      const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
      const useCase = buildUseCase({ transactions, gateway });

      await useCase.execute(buildCommand());

      expect(transactions.settleApprovedCalls).toHaveLength(0);
      expect(transactions.finalizeNonApprovedCalls).toHaveLength(0);
      errorSpy.mockRestore();
    });
  });

  it('stores a synchronously DECLINED gateway status as a successful (non-error) result', async () => {
    const gateway = new RecordingGatewayPort({ ok: true, value: { gatewayTransactionId: 'gw-1', status: 'DECLINED' } });
    const useCase = buildUseCase({ gateway });

    const result = await useCase.execute(buildCommand());

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().transaction.status).toBe('DECLINED');
  });

  it('builds the integrity signature from the persisted reference and computed total', async () => {
    const gateway = new RecordingGatewayPort({ ok: true, value: { gatewayTransactionId: 'gw-1', status: 'PENDING' } });
    const useCase = buildUseCase({ gateway });

    await useCase.execute(buildCommand());

    const expectedSignature = buildIntegritySignature({
      reference: 'REF-generated',
      amountInCents: 150_000 * 2 + 250_000 + 800_000,
      currency: 'COP',
      integritySecret: INTEGRITY_SECRET,
    });
    expect(gateway.lastCreateCardTransactionInput).toMatchObject({
      reference: 'REF-generated',
      amountInCents: 150_000 * 2 + 250_000 + 800_000,
      signature: expectedSignature,
      cardToken: 'tok_test_card',
      installments: 1,
    });
  });

  it('uses the idempotencyKey as the transaction id', async () => {
    const gateway = new RecordingGatewayPort({ ok: true, value: { gatewayTransactionId: 'gw-1', status: 'PENDING' } });
    const useCase = buildUseCase({ gateway });

    const result = await useCase.execute(buildCommand());

    expect(result._unsafeUnwrap().transaction.id).toBe(IDEMPOTENCY_KEY);
  });

  describe('idempotent replay (same idempotencyKey)', () => {
    it('returns the existing transaction without calling the gateway again', async () => {
      const gateway = new RecordingGatewayPort({ ok: true, value: { gatewayTransactionId: 'gw-1', status: 'APPROVED' } });
      const transactions = new FakeTransactionRepository();
      const useCase = buildUseCase({ transactions, gateway });

      const first = await useCase.execute(buildCommand());
      expect(gateway.lastCreateCardTransactionInput).toBeDefined();
      const replayGateway = new RecordingGatewayPort({ ok: true, value: { gatewayTransactionId: 'gw-2', status: 'APPROVED' } });
      const replayUseCase = buildUseCase({ transactions, gateway: replayGateway });

      const second = await replayUseCase.execute(buildCommand());

      expect(second.isOk()).toBe(true);
      expect(second._unsafeUnwrap()).toEqual(first._unsafeUnwrap());
      expect(second._unsafeUnwrap().transaction.gatewayTransactionId).toBe('gw-1');
      expect(replayGateway.lastCreateCardTransactionInput).toBeUndefined();
    });

    it('replays the stored transaction even when the product is now out of stock, before any product lookup or gateway call', async () => {
      // The first attempt bought the last unit and was APPROVED; the client
      // timed out and retried with the same key. The retry must get the
      // original APPROVED transaction back, never a 409 insufficient stock.
      const stored = buildTransaction({ id: IDEMPOTENCY_KEY, status: 'APPROVED', gatewayTransactionId: 'gw-1' });
      const transactions = new FakeTransactionRepository([stored]);
      const delivery = buildDelivery({ transactionId: IDEMPOTENCY_KEY });
      const products = new FakeProductRepository([buildProduct({ id: 'prod-1', stock: Stock.create(0)._unsafeUnwrap() })]);
      const findProductSpy = jest.spyOn(products, 'findById');
      const gateway = new RecordingGatewayPort({ ok: true, value: { gatewayTransactionId: 'gw-2', status: 'APPROVED' } });
      const useCase = buildUseCase({ products, transactions, gateway, deliveries: new FakeDeliveryRepository([delivery]) });

      const result = await useCase.execute(buildCommand());

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toEqual({ transaction: stored, delivery });
      expect(findProductSpy).not.toHaveBeenCalled();
      expect(gateway.lastCreateCardTransactionInput).toBeUndefined();
    });

    it('propagates an unexpected failure of the idempotency lookup without creating or charging anything', async () => {
      const lookupError = new UnexpectedError('DynamoDB unavailable');
      const transactions = new FakeTransactionRepository();
      jest.spyOn(transactions, 'findById').mockReturnValue(errAsync(lookupError));
      const createPendingSpy = jest.spyOn(transactions, 'createPending');
      const gateway = new RecordingGatewayPort({ ok: true, value: { gatewayTransactionId: 'gw-1', status: 'APPROVED' } });
      const useCase = buildUseCase({ transactions, gateway });

      const result = await useCase.execute(buildCommand());

      expect(result._unsafeUnwrapErr()).toBe(lookupError);
      expect(createPendingSpy).not.toHaveBeenCalled();
      expect(gateway.lastCreateCardTransactionInput).toBeUndefined();
    });

    it('still charges only once when a concurrent first request wins the conditional write after the lookup missed', async () => {
      // Both requests miss the early lookup; the atomic createPending is what
      // resolves the race — the loser gets wasCreated=false and never charges.
      const winner = buildTransaction({ id: IDEMPOTENCY_KEY, status: 'APPROVED', gatewayTransactionId: 'gw-1' });
      const transactions = new FakeTransactionRepository([winner]);
      jest.spyOn(transactions, 'findById').mockReturnValueOnce(errAsync(new NotFoundError('Transaction not found')));
      const gateway = new RecordingGatewayPort({ ok: true, value: { gatewayTransactionId: 'gw-2', status: 'APPROVED' } });
      const useCase = buildUseCase({ transactions, gateway });

      const result = await useCase.execute(buildCommand());

      expect(result._unsafeUnwrap().transaction).toEqual(winner);
      expect(gateway.lastCreateCardTransactionInput).toBeUndefined();
    });
  });

  describe('gateway-result persistence hardening', () => {
    let errorSpy: jest.SpyInstance;

    beforeEach(() => {
      errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    });

    afterEach(() => {
      errorSpy.mockRestore();
    });

    it('retries settlement once and succeeds after a transient DB failure (APPROVED routes through settleApproved)', async () => {
      const gateway = new RecordingGatewayPort({ ok: true, value: { gatewayTransactionId: 'gw-1', status: 'APPROVED' } });
      const transactions = new FlakyTransactionRepository();
      transactions.queueSettleApprovedFailure(new UnexpectedError('DynamoDB throttled'));
      const useCase = buildUseCase({ transactions, gateway });

      const result = await useCase.execute(buildCommand());

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().transaction.status).toBe('APPROVED');
      const stored = await transactions.findById(IDEMPOTENCY_KEY);
      expect(stored._unsafeUnwrap().status).toBe('APPROVED');
      expect(errorSpy).toHaveBeenCalledTimes(1);
      const logged = errorSpy.mock.calls[0][0] as string;
      expect(logged).toContain(IDEMPOTENCY_KEY);
      expect(logged).toContain('REF-generated');
      expect(logged).toContain('gw-1');
      expect(logged).toContain('APPROVED');
      expect(logged).not.toContain('jane.doe@example.com');
      expect(logged).not.toContain('tok_test_card');
    });

    it('returns the persistence error when the retry also fails too, and NEVER marks the transaction ERROR (the gateway already approved and charged the card)', async () => {
      const gateway = new RecordingGatewayPort({ ok: true, value: { gatewayTransactionId: 'gw-1', status: 'APPROVED' } });
      const transactions = new FlakyTransactionRepository();
      const secondFailure = new UnexpectedError('DynamoDB still throttled');
      transactions.queueSettleApprovedFailure(new UnexpectedError('DynamoDB throttled'));
      transactions.queueSettleApprovedFailure(secondFailure);
      const useCase = buildUseCase({ transactions, gateway });

      const result = await useCase.execute(buildCommand());

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr()).toBe(secondFailure);
      // CRITICAL: the persisted row must stay PENDING, never ERROR — the
      // gateway call itself succeeded (APPROVED), only OUR write failed.
      // Misclassifying this as a gateway rejection would falsely mark a
      // successfully-charged transaction as ERROR.
      const stored = await transactions.findById(IDEMPOTENCY_KEY);
      expect(stored._unsafeUnwrap().status).toBe('PENDING');
      // Best-effort: the gatewayTransactionId is still recorded via the
      // lightweight conditioned write so lazy-poll/webhook can resolve it later.
      expect(stored._unsafeUnwrap().gatewayTransactionId).toBe('gw-1');
      expect(transactions.finalizeNonApprovedCalls).toHaveLength(0);
      expect(errorSpy).toHaveBeenCalledTimes(2);
      expect(errorSpy.mock.calls[0][0] as string).toContain('retrying once');
      const secondLog = errorSpy.mock.calls[1][0] as string;
      expect(secondLog).toContain(IDEMPOTENCY_KEY);
      expect(secondLog).toContain('leaving transaction PENDING');
    });

    it('swallows a secondary failure when even the best-effort fallback write fails, and still returns the original retry error', async () => {
      const gateway = new RecordingGatewayPort({ ok: true, value: { gatewayTransactionId: 'gw-1', status: 'APPROVED' } });
      const transactions = new FlakyTransactionRepository();
      const secondFailure = new UnexpectedError('DynamoDB still throttled');
      transactions.queueSettleApprovedFailure(new UnexpectedError('DynamoDB throttled'));
      transactions.queueSettleApprovedFailure(secondFailure);
      transactions.queueUpdateGatewayResultFailure(new UnexpectedError('fallback write also failed'));
      const useCase = buildUseCase({ transactions, gateway });

      const result = await useCase.execute(buildCommand());

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr()).toBe(secondFailure);
    });

    it('never routes a persistence failure through the definite-gateway-rejection path (settleApproved is never re-invoked as a call-failure handler)', async () => {
      const gateway = new RecordingGatewayPort({ ok: true, value: { gatewayTransactionId: 'gw-1', status: 'APPROVED' } });
      const transactions = new FlakyTransactionRepository();
      transactions.queueSettleApprovedFailure(new UnexpectedError('DynamoDB throttled'));
      transactions.queueSettleApprovedFailure(new UnexpectedError('DynamoDB still throttled'));
      const useCase = buildUseCase({ transactions, gateway });

      await useCase.execute(buildCommand());

      expect(gateway.lastCreateCardTransactionInput).toBeDefined();
      expect(transactions.settleApprovedCalls).toHaveLength(0); // both attempts were intercepted by the queue, never reached real logic
    });

    it('propagates the ORIGINAL PaymentGatewayError and logs the secondary DB error when finalizing ERROR status also fails (definite rejection)', async () => {
      const gatewayError = new PaymentGatewayError('Payment gateway request failed: 422', false);
      const gateway = new RecordingGatewayPort({ ok: false, error: gatewayError });
      const transactions = new FlakyTransactionRepository();
      const persistError = new UnexpectedError('DynamoDB unavailable');
      transactions.queueFinalizeNonApprovedFailure(persistError);
      const useCase = buildUseCase({ transactions, gateway });

      const result = await useCase.execute(buildCommand());

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr()).toBe(gatewayError);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      const logged = errorSpy.mock.calls[0][0] as string;
      expect(logged).toContain('DynamoDB unavailable');
      expect(logged).toContain('after a definite gateway rejection');
    });
  });
});
