import { Logger } from '@nestjs/common';

import { DomainError, PaymentGatewayError, UnexpectedError } from '../../shared/errors/domain-error';
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
import { UpdateGatewayResultInput } from '../domain/transaction.repository.port';
import { FakeTransactionRepository } from '../test/transaction.fixtures';
import { CreateTransactionCommand, CreateTransactionUseCase } from './create-transaction.use-case';

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
}

/**
 * Wraps a real `FakeTransactionRepository` but lets a test queue scripted
 * `updateGatewayResult` outcomes (consumed in call order) before falling
 * back to the real delegate — used to simulate a transient DB failure
 * followed by a successful retry, or a persistent failure.
 */
class FlakyTransactionRepository extends FakeTransactionRepository {
  private readonly updateGatewayResultQueue: Array<() => AppResultAsync<Transaction>> = [];

  queueUpdateGatewayResultFailure(error: DomainError): void {
    this.updateGatewayResultQueue.push(() => errAsync(error));
  }

  updateGatewayResult(id: string, input: UpdateGatewayResultInput): AppResultAsync<Transaction> {
    const next = this.updateGatewayResultQueue.shift();
    return next ? next() : super.updateGatewayResult(id, input);
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
  gateway: PaymentGatewayPort;
  clock?: ClockPort;
  ids?: IdGeneratorPort;
}) {
  return new CreateTransactionUseCase(
    options.products ?? new FakeProductRepository([buildProduct({ id: 'prod-1', stock: Stock.create(10)._unsafeUnwrap() })]),
    options.customers ?? new FakeCustomerRepository(),
    options.transactions ?? new FakeTransactionRepository(),
    options.gateway,
    options.clock ?? buildFakeClock(0),
    options.ids ?? new SequentialIdGenerator(),
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
    const transaction = result._unsafeUnwrap();
    expect(transaction.status).toBe('APPROVED');
    expect(transaction.gatewayTransactionId).toBe('gw-1');
    expect(transaction.totalAmount.valueInCents).toBe(150_000 * 2 + 250_000 + 800_000);
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

    expect(result._unsafeUnwrap().customerId).toBe('cust-existing');
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

  it('marks the transaction as ERROR and propagates the error when the gateway call fails', async () => {
    const gatewayError = new PaymentGatewayError('Payment gateway request failed: network down');
    const gateway = new RecordingGatewayPort({ ok: false, error: gatewayError });
    const transactions = new FakeTransactionRepository();
    const useCase = buildUseCase({ transactions, gateway });

    const result = await useCase.execute(buildCommand());

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toBe(gatewayError);
    const stored = await transactions.findById(IDEMPOTENCY_KEY);
    expect(stored._unsafeUnwrap().status).toBe('ERROR');
  });

  it('stores a synchronously DECLINED gateway status as a successful (non-error) result', async () => {
    const gateway = new RecordingGatewayPort({ ok: true, value: { gatewayTransactionId: 'gw-1', status: 'DECLINED' } });
    const useCase = buildUseCase({ gateway });

    const result = await useCase.execute(buildCommand());

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().status).toBe('DECLINED');
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

    expect(result._unsafeUnwrap().id).toBe(IDEMPOTENCY_KEY);
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
      expect(second._unsafeUnwrap().gatewayTransactionId).toBe('gw-1');
      expect(replayGateway.lastCreateCardTransactionInput).toBeUndefined();
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

    it('retries updateGatewayResult once and succeeds after a transient DB failure', async () => {
      const gateway = new RecordingGatewayPort({ ok: true, value: { gatewayTransactionId: 'gw-1', status: 'APPROVED' } });
      const transactions = new FlakyTransactionRepository();
      transactions.queueUpdateGatewayResultFailure(new UnexpectedError('DynamoDB throttled'));
      const useCase = buildUseCase({ transactions, gateway });

      const result = await useCase.execute(buildCommand());

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().status).toBe('APPROVED');
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

    it('returns the persistence error when the retry also fails too', async () => {
      const gateway = new RecordingGatewayPort({ ok: true, value: { gatewayTransactionId: 'gw-1', status: 'APPROVED' } });
      const transactions = new FlakyTransactionRepository();
      const secondFailure = new UnexpectedError('DynamoDB still throttled');
      transactions.queueUpdateGatewayResultFailure(new UnexpectedError('DynamoDB throttled'));
      transactions.queueUpdateGatewayResultFailure(secondFailure);
      const useCase = buildUseCase({ transactions, gateway });

      const result = await useCase.execute(buildCommand());

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr()).toBe(secondFailure);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy.mock.calls[0][0] as string).toContain('retrying once');
    });

    it('propagates the ORIGINAL PaymentGatewayError and logs the secondary DB error when persisting ERROR status also fails', async () => {
      const gatewayError = new PaymentGatewayError('Payment gateway request failed: network down');
      const gateway = new RecordingGatewayPort({ ok: false, error: gatewayError });
      const transactions = new FlakyTransactionRepository();
      const persistError = new UnexpectedError('DynamoDB unavailable');
      transactions.queueUpdateGatewayResultFailure(persistError);
      const useCase = buildUseCase({ transactions, gateway });

      const result = await useCase.execute(buildCommand());

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr()).toBe(gatewayError);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      const logged = errorSpy.mock.calls[0][0] as string;
      expect(logged).toContain('DynamoDB unavailable');
      expect(logged).toContain('after a gateway failure');
    });
  });
});
