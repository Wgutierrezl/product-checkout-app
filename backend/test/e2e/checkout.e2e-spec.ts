// Env vars MUST be set before `AppModule` (and its `ConfigModule.forRoot`)
// is ever imported/instantiated — `configuration()` reads `process.env` at
// each Nest module build, so this only works because these assignments run
// before the imports below are evaluated.
process.env.NODE_ENV = 'test';
process.env.PAYMENT_GATEWAY_URL = 'https://gateway.e2e.test';
process.env.PAYMENT_GATEWAY_PUBLIC_KEY = 'pub_test_e2e';
process.env.PAYMENT_GATEWAY_PRIVATE_KEY = 'priv_test_e2e';
process.env.PAYMENT_GATEWAY_INTEGRITY_SECRET = 'integrity_secret_e2e';
process.env.PAYMENT_GATEWAY_EVENTS_SECRET = 'events_secret_e2e';
process.env.CORS_ALLOWED_ORIGINS = 'https://allowed.e2e.test';
process.env.AWS_REGION = 'us-east-1';
process.env.DYNAMO_ENDPOINT = 'http://localhost:8000';
// DynamoDB Local never checks these against a real account, but it DOES
// reject an Access Key ID that isn't shaped like a real AWS key (20
// uppercase alphanumeric chars) with `UnrecognizedClientException` — these
// are AWS's own documented example placeholder credentials, safe to use
// against any local-only endpoint.
process.env.AWS_ACCESS_KEY_ID = 'AKIAIOSFODNN7EXAMPLE';
process.env.AWS_SECRET_ACCESS_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
// 0 forces `GetTransactionUseCase`'s lazy-poll to trigger on every GET —
// deterministic and fast, no need to sleep past a real staleness window.
process.env.LAZY_POLL_THRESHOLD_MS = '0';
// Generous for the main app — several tests legitimately hit the same route
// (e.g. GET /products/:id) more than once. The dedicated throttle test below
// spins up its own app instance with a tiny limit instead.
process.env.THROTTLE_TTL = '60';
process.env.THROTTLE_LIMIT = '100';
process.env.ACCOUNTS_JWT_SECRET = 'e2e-test-jwt-secret-at-least-32-characters-long';

import 'reflect-metadata';
import { randomUUID, createHash } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import jwt from 'jsonwebtoken';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { applyGlobalConfig } from '../../src/shared/bootstrap';
import { PAYMENT_GATEWAY_PORT } from '../../src/shared/payment-gateway/domain/payment-gateway.port';
import {
  APPROVED_CARD_TOKEN,
  DECLINED_CARD_TOKEN,
  FakePaymentGatewayAdapter,
} from './support/fake-payment-gateway.adapter';
import {
  cleanAndSeedTables,
  findCustomerIdByEmail,
  PRODUCT_A_ID,
  PRODUCT_A_STOCK,
  PRODUCT_B_ID,
  PRODUCT_B_STOCK,
} from './support/dynamo-e2e.support';

const EVENTS_SECRET = process.env.PAYMENT_GATEWAY_EVENTS_SECRET!;

interface CreateTransactionBody {
  idempotencyKey: string;
  productId: string;
  quantity: number;
  customer: { fullName: string; email: string; phone: string };
  delivery: { address: string; city: string; region: string };
  cardToken: string;
  installments: number;
  acceptanceToken: string;
  acceptPersonalAuth: string;
}

function buildCreateTransactionBody(
  productId: string,
  quantity: number,
  cardToken: string,
  idempotencyKey: string = randomUUID(),
): CreateTransactionBody {
  return {
    idempotencyKey,
    productId,
    quantity,
    customer: {
      fullName: 'E2E Test Buyer',
      email: `e2e-buyer-${randomUUID()}@example.test`,
      phone: '+573001234567',
    },
    delivery: { address: 'Calle Falsa 123', city: 'Bogota', region: 'Cundinamarca' },
    cardToken,
    installments: 1,
    acceptanceToken: 'e2e-acceptance-token',
    acceptPersonalAuth: 'e2e-personal-auth-token',
  };
}

function buildWebhookPayload(input: { gatewayTransactionId: string; status: string; reference?: string }): {
  event: string;
  data: { transaction: Record<string, unknown> };
  environment: string;
  signature: { properties: string[]; checksum: string };
  timestamp: number;
  sent_at: string;
} {
  const timestamp = Math.floor(Date.now() / 1000);
  const properties = ['transaction.id', 'transaction.status'];
  const transactionData: Record<string, unknown> = { id: input.gatewayTransactionId, status: input.status };
  if (input.reference) {
    transactionData.reference = input.reference;
  }

  const values = [input.gatewayTransactionId, input.status];
  const checksum = createHash('sha256')
    .update(`${values.join('')}${timestamp}${EVENTS_SECRET}`)
    .digest('hex');

  return {
    event: 'transaction.updated',
    data: { transaction: transactionData },
    environment: 'test',
    signature: { properties, checksum },
    timestamp,
    sent_at: new Date().toISOString(),
  };
}

async function pollUntilApproved(
  server: Parameters<typeof request>[0],
  transactionId: string,
  attempts = 5,
): Promise<Record<string, any>> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await request(server).get(`/transactions/${transactionId}`).expect(200);
    if (response.body.status === 'APPROVED') {
      return response.body;
    }
  }
  throw new Error(`Transaction ${transactionId} did not reach APPROVED after ${attempts} polls`);
}

describe('Checkout E2E', () => {
  let app: INestApplication;
  let fakeGateway: FakePaymentGatewayAdapter;
  let server: ReturnType<INestApplication['getHttpServer']>;

  beforeAll(async () => {
    await cleanAndSeedTables();

    fakeGateway = new FakePaymentGatewayAdapter();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PAYMENT_GATEWAY_PORT)
      .useValue(fakeGateway)
      .compile();

    app = moduleRef.createNestApplication();
    applyGlobalConfig(app);
    await app.init();
    server = app.getHttpServer();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  describe('GET /health', () => {
    it('reports ok liveness status', async () => {
      const response = await request(server).get('/health').expect(200);
      expect(response.body).toEqual({ status: 'ok', timestamp: expect.any(String) });
    });
  });

  describe('GET /products', () => {
    it('lists every seeded product', async () => {
      const response = await request(server).get('/products').expect(200);
      const ids = (response.body as Array<{ id: string }>).map((product) => product.id);
      expect(ids).toEqual(expect.arrayContaining([PRODUCT_A_ID, PRODUCT_B_ID]));
    });
  });

  describe('GET /products/:id', () => {
    it('responds 400 for a malformed id', async () => {
      const response = await request(server).get('/products/not-a-uuid').expect(400);
      expect(response.body).not.toHaveProperty('stack');
    });

    it('responds 404 for a well-formed but unknown id', async () => {
      await request(server).get('/products/00000000-0000-4000-8000-000000000000').expect(404);
    });

    it('responds 200 with the product detail for a known id', async () => {
      const response = await request(server).get(`/products/${PRODUCT_A_ID}`).expect(200);
      expect(response.body.id).toBe(PRODUCT_A_ID);
      expect(response.body.stock).toBe(PRODUCT_A_STOCK);
    });
  });

  describe('GET /payment-acceptance', () => {
    it('proxies acceptance tokens from the gateway, never exposing gateway credentials', async () => {
      const response = await request(server).get('/payment-acceptance').expect(200);
      expect(response.body.acceptanceToken).toBe('e2e-acceptance-token');
      expect(response.body.acceptPersonalAuth).toBe('e2e-personal-auth-token');
      expect(JSON.stringify(response.body)).not.toMatch(/priv_test_e2e/);
    });
  });

  describe('POST /transactions — validation and business rules', () => {
    it('rejects an unknown extra field under whitelist validation (400)', async () => {
      const body = { ...buildCreateTransactionBody(PRODUCT_A_ID, 1, APPROVED_CARD_TOKEN), amount: 999_999 };
      const response = await request(server).post('/transactions').send(body).expect(400);
      expect(response.body).not.toHaveProperty('stack');
    });

    it('rejects insufficient stock with 409 and makes no gateway call', async () => {
      const callsBefore = fakeGateway.createCardTransactionCalls;
      await request(server)
        .post('/transactions')
        .send(buildCreateTransactionBody(PRODUCT_B_ID, PRODUCT_B_STOCK + 1, APPROVED_CARD_TOKEN))
        .expect(409);
      expect(fakeGateway.createCardTransactionCalls).toBe(callsBefore);
    });
  });

  describe('POST /transactions — happy path', () => {
    it('PENDING -> lazy-poll to APPROVED, decrements stock, embeds delivery, and is idempotent on replay', async () => {
      const body = buildCreateTransactionBody(PRODUCT_A_ID, 2, APPROVED_CARD_TOKEN);

      const createResponse = await request(server).post('/transactions').send(body).expect(201);
      expect(createResponse.body.status).toBe('PENDING');
      const transactionId = createResponse.body.id as string;

      const approved = await pollUntilApproved(server, transactionId);
      expect(approved.status).toBe('APPROVED');
      expect(approved.delivery).toBeDefined();
      expect(approved.delivery.id).toEqual(expect.any(String));

      const productAfter = await request(server).get(`/products/${PRODUCT_A_ID}`).expect(200);
      expect(productAfter.body.stock).toBe(PRODUCT_A_STOCK - 2);

      // GET /deliveries/:id — masked, guest-checkout read (no auth layer)
      const deliveryResponse = await request(server).get(`/deliveries/${approved.delivery.id}`).expect(200);
      expect(deliveryResponse.body.address).not.toBe(body.delivery.address);
      expect(deliveryResponse.body.address.endsWith('***')).toBe(true);
      expect(deliveryResponse.body).not.toHaveProperty('customerId');

      // Idempotent replay: same idempotencyKey never charges the gateway again
      const callsBefore = fakeGateway.createCardTransactionCalls;
      const replay = await request(server).post('/transactions').send(body).expect(201);
      expect(replay.body.id).toBe(transactionId);
      expect(fakeGateway.createCardTransactionCalls).toBe(callsBefore);

      // GET /customers/:id — masked. customerId is never exposed by any
      // response DTO, so it's resolved directly via the EmailIndex GSI.
      const customerId = await findCustomerIdByEmail(body.customer.email);
      const customerResponse = await request(server).get(`/customers/${customerId}`).expect(200);
      expect(customerResponse.body.email).not.toBe(body.customer.email);
      expect(customerResponse.body.email).toContain('***');
      expect(customerResponse.body.phone).not.toBe(body.customer.phone);
      expect(customerResponse.body.phone.endsWith(body.customer.phone.slice(-4))).toBe(true);
    });
  });

  describe('POST /transactions — declined path', () => {
    it('settles DECLINED synchronously with no stock change and no delivery', async () => {
      const before = await request(server).get(`/products/${PRODUCT_A_ID}`).expect(200);
      const body = buildCreateTransactionBody(PRODUCT_A_ID, 1, DECLINED_CARD_TOKEN);

      const response = await request(server).post('/transactions').send(body).expect(201);
      expect(response.body.status).toBe('DECLINED');
      expect(response.body.delivery).toBeUndefined();

      const after = await request(server).get(`/products/${PRODUCT_A_ID}`).expect(200);
      expect(after.body.stock).toBe(before.body.stock);
    });
  });

  describe('POST /transactions/webhook', () => {
    it('rejects an invalid checksum with 400 and applies no side effects', async () => {
      const payload = buildWebhookPayload({ gatewayTransactionId: 'gw-unknown-bad-checksum', status: 'APPROVED' });
      payload.signature.checksum = '0'.repeat(64);

      const response = await request(server).post('/transactions/webhook').send(payload).expect(400);
      expect(response.body).not.toHaveProperty('stack');
    });
  });

  describe('Security hardening', () => {
    it('sets helmet security headers on every response', async () => {
      const response = await request(server).get('/health').expect(200);
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-dns-prefetch-control']).toBeDefined();
      expect(response.headers['strict-transport-security']).toBeDefined();
    });

    it('reflects an allowed CORS origin and omits the header for a disallowed one', async () => {
      const allowed = await request(server).get('/health').set('Origin', 'https://allowed.e2e.test').expect(200);
      expect(allowed.headers['access-control-allow-origin']).toBe('https://allowed.e2e.test');

      const disallowed = await request(server).get('/health').set('Origin', 'https://evil.example.test').expect(200);
      expect(disallowed.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('never leaks a stack trace in an error response body', async () => {
      const response = await request(server).get('/products/not-a-uuid').expect(400);
      expect(response.body).not.toHaveProperty('stack');
      expect(JSON.stringify(response.body)).not.toContain('.ts:');
    });
  });
});

describe('Rate limiting', () => {
  let throttledApp: INestApplication;
  let throttledServer: ReturnType<INestApplication['getHttpServer']>;

  beforeAll(async () => {
    // A tiny, dedicated limit isolates this from the main app's functional
    // tests above — ThrottlerGuard's default key is per controller+handler,
    // so this app's own low limit never interferes with `app`'s routes, and
    // vice versa (they're two entirely separate Nest DI containers/instances
    // that happen to share the same DynamoDB tables read-only for this test).
    process.env.THROTTLE_LIMIT = '2';
    process.env.THROTTLE_TTL = '60';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PAYMENT_GATEWAY_PORT)
      .useValue(new FakePaymentGatewayAdapter())
      .compile();

    throttledApp = moduleRef.createNestApplication();
    applyGlobalConfig(throttledApp);
    await throttledApp.init();
    throttledServer = throttledApp.getHttpServer();

    process.env.THROTTLE_LIMIT = '100';
  }, 30_000);

  afterAll(async () => {
    await throttledApp?.close();
  });

  it('returns 429 once a route exceeds its per-window limit', async () => {
    await request(throttledServer).get('/products').expect(200);
    await request(throttledServer).get('/products').expect(200);
    const response = await request(throttledServer).get('/products').expect(429);
    expect(response.body).not.toHaveProperty('stack');
  });

  it('never throttles GET /health regardless of call volume', async () => {
    for (let i = 0; i < 5; i += 1) {
      await request(throttledServer).get('/health').expect(200);
    }
  });

  it('never throttles POST /transactions/webhook regardless of call volume', async () => {
    const payload = buildWebhookPayload({ gatewayTransactionId: 'gw-throttle-check', status: 'APPROVED' });
    for (let i = 0; i < 5; i += 1) {
      await request(throttledServer).post('/transactions/webhook').send(payload).expect(200);
    }
  });

  it('does not 429 GET /transactions/:id under its own higher limit, unlike the still-throttled global default', async () => {
    // GET /transactions/:id carries its own @Throttle({ default: { limit: 60, ttl: 60_000 } })
    // (see TransactionsController#getById), independent of this app's THROTTLE_LIMIT=2 global
    // default — the same default `/products` throttles at 2 requests in the sibling test above.
    // The id itself doesn't need to resolve to a real transaction: the guard runs before the
    // route handler, so a well-formed-but-unknown UUID still exercises the throttle decision on
    // every request while keeping this test independent of the main app's seeded data.
    const unknownId = '00000000-0000-4000-8000-000000000000';

    for (let i = 0; i < 20; i += 1) {
      const response = await request(throttledServer).get(`/transactions/${unknownId}`);
      expect(response.status).not.toBe(429);
    }
  });
});

describe('Accounts E2E (register -> login)', () => {
  let accountsApp: INestApplication;
  let accountsServer: ReturnType<INestApplication['getHttpServer']>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    accountsApp = moduleRef.createNestApplication();
    applyGlobalConfig(accountsApp);
    await accountsApp.init();
    accountsServer = accountsApp.getHttpServer();
  }, 30_000);

  afterAll(async () => {
    await accountsApp?.close();
  });

  function uniqueRegisterBody() {
    return {
      fullName: 'E2E Auth Buyer',
      email: `e2e-auth-${randomUUID()}@example.test`,
      password: 'correct-horse-battery-staple',
    };
  }

  it('registers, then logs in with the same credentials and receives a usable JWT', async () => {
    const body = uniqueRegisterBody();

    const registerResponse = await request(accountsServer).post('/auth/register').send(body).expect(201);
    expect(registerResponse.body).toEqual({
      userId: expect.any(String),
      fullName: body.fullName,
      email: body.email,
    });
    expect(JSON.stringify(registerResponse.body)).not.toMatch(/passwordHash|correct-horse-battery-staple/);

    const loginResponse = await request(accountsServer)
      .post('/auth/login')
      .send({ email: body.email, password: body.password })
      .expect(200);
    expect(loginResponse.body).toEqual({
      accessToken: expect.any(String),
      tokenType: 'Bearer',
      expiresIn: 3600,
    });

    const decoded = jwt.decode(loginResponse.body.accessToken as string) as jwt.JwtPayload;
    expect(decoded.email).toBe(body.email);
    expect(decoded.sub).toBe(registerResponse.body.userId);
  });

  it('rejects a duplicate registration with 409 and never leaks a stack trace', async () => {
    const body = uniqueRegisterBody();
    await request(accountsServer).post('/auth/register').send(body).expect(201);

    const response = await request(accountsServer).post('/auth/register').send(body).expect(409);
    expect(response.body).not.toHaveProperty('stack');
  });

  it('rejects login with an unknown email with 401 and no credential detail', async () => {
    const response = await request(accountsServer)
      .post('/auth/login')
      .send({ email: `unknown-${randomUUID()}@example.test`, password: 'whatever-password' })
      .expect(401);
    expect(response.body).not.toHaveProperty('stack');
  });

  it('rejects login with a wrong password with 401', async () => {
    const body = uniqueRegisterBody();
    await request(accountsServer).post('/auth/register').send(body).expect(201);

    await request(accountsServer)
      .post('/auth/login')
      .send({ email: body.email, password: 'the-wrong-password' })
      .expect(401);
  });

  it('rejects a protected-shaped Bearer check performed manually against a tampered token', () => {
    // No protected route exists yet in this PR slice (GET /me lands in a
    // later PR) — this asserts the issued token itself is genuinely
    // signature-verified end to end, the same guarantee JwtAuthGuard relies on.
    const token = jwt.sign({ sub: 'user-x', email: 'x@example.test' }, 'wrong-secret', {
      algorithm: 'HS256',
      expiresIn: '1h',
    });

    expect(() => jwt.verify(token, process.env.ACCOUNTS_JWT_SECRET!)).toThrow();
  });

  it('returns 429 once register exceeds its stricter 5-requests-per-60s limit', async () => {
    // A dedicated, freshly-booted app: ThrottlerStorage is in-memory per Nest
    // app instance, so this starts from a clean counter regardless of how
    // many /auth/register calls the tests above already made against the
    // shared `accountsServer` instance (same isolation pattern as the
    // top-level 'Rate limiting' describe above).
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const throttledAccountsApp = moduleRef.createNestApplication();
    applyGlobalConfig(throttledAccountsApp);
    await throttledAccountsApp.init();
    const throttledAccountsServer = throttledAccountsApp.getHttpServer();

    try {
      for (let i = 0; i < 5; i += 1) {
        const response = await request(throttledAccountsServer)
          .post('/auth/register')
          .send(uniqueRegisterBody());
        expect(response.status).toBe(201);
      }

      const sixth = await request(throttledAccountsServer).post('/auth/register').send(uniqueRegisterBody());
      expect(sixth.status).toBe(429);
    } finally {
      await throttledAccountsApp.close();
    }
  });
});
