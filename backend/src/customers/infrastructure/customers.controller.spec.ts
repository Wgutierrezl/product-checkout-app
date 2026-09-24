import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { NotFoundError } from '../../shared/errors/domain-error';
import { errAsync, okAsync } from '../../shared/result/result.types';
import { GetCustomerUseCase } from '../application/get-customer.use-case';
import { buildCustomer } from '../test/customer.fixtures';
import { CustomersController } from './customers.controller';

describe('CustomersController', () => {
  describe('getById', () => {
    it('returns the mapped, PII-masked customer DTO when found', async () => {
      const getCustomer = {
        execute: () => okAsync(buildCustomer()),
      } as unknown as GetCustomerUseCase;
      const controller = new CustomersController(getCustomer);

      const result = await controller.getById('cust-1');

      expect(result).toEqual({
        id: 'cust-1',
        fullName: 'Jane Doe',
        email: 'ja******@example.com',
        phone: '********4567',
      });
    });

    it('throws the DomainError when the customer is not found', async () => {
      const notFound = new NotFoundError('Customer missing-id not found');
      const getCustomer = { execute: () => errAsync(notFound) } as unknown as GetCustomerUseCase;
      const controller = new CustomersController(getCustomer);

      await expect(controller.getById('missing-id')).rejects.toBe(notFound);
    });
  });

  describe('GET /customers/:id route validation (HTTP)', () => {
    let app: INestApplication;

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        controllers: [CustomersController],
        providers: [
          { provide: GetCustomerUseCase, useValue: { execute: () => okAsync(buildCustomer()) } },
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it('rejects a malformed (non-UUID) id with 400', async () => {
      await request(app.getHttpServer()).get('/customers/not-a-uuid').expect(400);
    });

    it('accepts a well-formed UUID id', async () => {
      await request(app.getHttpServer())
        .get('/customers/e1a6b6b0-6c9e-4a3a-9c1a-6f6f2b6b1a10')
        .expect(200);
    });
  });
});
