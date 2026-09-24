import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { NotFoundError } from '../../shared/errors/domain-error';
import { errAsync, okAsync } from '../../shared/result/result.types';
import { CreateTransactionUseCase } from '../application/create-transaction.use-case';
import { GetTransactionUseCase } from '../application/get-transaction.use-case';
import { buildTransaction } from '../test/transaction.fixtures';
import { TransactionsController } from './transactions.controller';

function validCreateBody() {
  return {
    idempotencyKey: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
    productId: 'e1a6b6b0-6c9e-4a3a-9c1a-6f6f2b6b1a10',
    quantity: 2,
    customer: { fullName: 'Jane Doe', email: 'jane.doe@example.com', phone: '+573001234567' },
    delivery: { address: 'Cra 1 # 2-3', city: 'Bogota', region: 'Cundinamarca' },
    cardToken: 'tok_test_card',
    installments: 1,
    acceptanceToken: 'acc-token-1',
    acceptPersonalAuth: 'auth-token-1',
  };
}

describe('TransactionsController', () => {
  describe('create', () => {
    it('returns the mapped transaction DTO with an amounts breakdown', async () => {
      const transaction = buildTransaction({ status: 'APPROVED', gatewayTransactionId: 'gw-1' });
      const createTransaction = { execute: () => okAsync(transaction) } as unknown as CreateTransactionUseCase;
      const controller = new TransactionsController(createTransaction, {} as unknown as GetTransactionUseCase);

      const result = await controller.create(validCreateBody());

      expect(result).toEqual({
        id: 'tx-1',
        reference: 'REF-tx-1',
        status: 'APPROVED',
        productAmount: 300_000,
        baseFee: 250_000,
        deliveryFee: 800_000,
        total: 1_350_000,
        currency: 'COP',
      });
    });

    it('throws the DomainError when the use case fails', async () => {
      const notFound = new NotFoundError('Product missing-id not found');
      const createTransaction = { execute: () => errAsync(notFound) } as unknown as CreateTransactionUseCase;
      const controller = new TransactionsController(createTransaction, {} as unknown as GetTransactionUseCase);

      await expect(controller.create(validCreateBody())).rejects.toBe(notFound);
    });
  });

  describe('getById', () => {
    it('returns the mapped transaction DTO when found', async () => {
      const transaction = buildTransaction();
      const getTransaction = { execute: () => okAsync(transaction) } as unknown as GetTransactionUseCase;
      const controller = new TransactionsController(
        {} as unknown as CreateTransactionUseCase,
        getTransaction,
      );

      const result = await controller.getById('tx-1');

      expect(result.id).toBe('tx-1');
      expect(result.status).toBe('PENDING');
    });

    it('throws the DomainError when the transaction is not found', async () => {
      const notFound = new NotFoundError('Transaction missing-id not found');
      const getTransaction = { execute: () => errAsync(notFound) } as unknown as GetTransactionUseCase;
      const controller = new TransactionsController(
        {} as unknown as CreateTransactionUseCase,
        getTransaction,
      );

      await expect(controller.getById('missing-id')).rejects.toBe(notFound);
    });
  });

  describe('HTTP route validation', () => {
    let app: INestApplication;

    beforeAll(async () => {
      const { ValidationPipe } = await import('@nestjs/common');
      const moduleRef = await Test.createTestingModule({
        controllers: [TransactionsController],
        providers: [
          { provide: CreateTransactionUseCase, useValue: { execute: () => okAsync(buildTransaction()) } },
          { provide: GetTransactionUseCase, useValue: { execute: () => okAsync(buildTransaction()) } },
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it('rejects a POST body missing required fields with 400', async () => {
      await request(app.getHttpServer()).post('/transactions').send({}).expect(400);
    });

    it('rejects a POST body with an invalid nested customer email with 400', async () => {
      await request(app.getHttpServer())
        .post('/transactions')
        .send({ ...validCreateBody(), customer: { ...validCreateBody().customer, email: 'not-an-email' } })
        .expect(400);
    });

    it('rejects installments outside the 1-36 range with 400', async () => {
      await request(app.getHttpServer())
        .post('/transactions')
        .send({ ...validCreateBody(), installments: 37 })
        .expect(400);
    });

    it('rejects a missing or malformed idempotencyKey with 400', async () => {
      const { idempotencyKey: _idempotencyKey, ...rest } = validCreateBody();
      await request(app.getHttpServer()).post('/transactions').send(rest).expect(400);
      await request(app.getHttpServer())
        .post('/transactions')
        .send({ ...validCreateBody(), idempotencyKey: 'not-a-uuid' })
        .expect(400);
    });

    it('rejects a quantity above the 10-unit cap with 400', async () => {
      await request(app.getHttpServer())
        .post('/transactions')
        .send({ ...validCreateBody(), quantity: 11 })
        .expect(400);
    });

    it('accepts a quantity at the 10-unit cap', async () => {
      await request(app.getHttpServer())
        .post('/transactions')
        .send({ ...validCreateBody(), quantity: 10 })
        .expect(201);
    });

    it('accepts a well-formed create body', async () => {
      await request(app.getHttpServer()).post('/transactions').send(validCreateBody()).expect(201);
    });

    it('rejects a malformed (non-UUID) transaction id with 400', async () => {
      await request(app.getHttpServer()).get('/transactions/not-a-uuid').expect(400);
    });

    it('accepts a well-formed UUID transaction id', async () => {
      await request(app.getHttpServer())
        .get('/transactions/e1a6b6b0-6c9e-4a3a-9c1a-6f6f2b6b1a10')
        .expect(200);
    });
  });
});
