import { PaymentGatewayError } from '../../shared/errors/domain-error';
import { ClockPort } from '../../shared/ports/clock.port';
import { IdGeneratorPort } from '../../shared/ports/id-generator.port';
import { buildIntegritySignature } from '../../shared/payment-gateway/domain/integrity-signature';
import { AppResultAsync, errAsync, okAsync } from '../../shared/result/result.types';
import { PaymentGatewayPort } from '../../shared/payment-gateway/domain/payment-gateway.port';
import { CreateCardTransactionInput, GatewayTransactionResult } from '../../shared/payment-gateway/domain/payment-gateway.types';
import { buildCustomer, FakeCustomerRepository } from '../../customers/test/customer.fixtures';
import { buildProduct, FakeProductRepository } from '../../products/test/product.fixtures';
import { Stock } from '../../products/domain/value-objects/stock.vo';
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

function buildCommand(overrides: Partial<CreateTransactionCommand> = {}): CreateTransactionCommand {
  return {
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
    const stored = await transactions.findById('generated-id-2');
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
});
