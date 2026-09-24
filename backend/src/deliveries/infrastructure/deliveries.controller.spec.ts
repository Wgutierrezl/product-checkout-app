import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { NotFoundError } from '../../shared/errors/domain-error';
import { errAsync, okAsync } from '../../shared/result/result.types';
import { GetDeliveryUseCase } from '../application/get-delivery.use-case';
import { buildDelivery } from '../test/delivery.fixtures';
import { DeliveriesController } from './deliveries.controller';

describe('DeliveriesController', () => {
  describe('getById', () => {
    it('returns the mapped delivery DTO when found', async () => {
      const getDelivery = {
        execute: () => okAsync(buildDelivery()),
      } as unknown as GetDeliveryUseCase;
      const controller = new DeliveriesController(getDelivery);

      const result = await controller.getById('delivery-1');

      expect(result).toEqual({
        id: 'delivery-1',
        transactionId: 'txn-1',
        address: 'Cra ***',
        city: 'Bogotá',
        region: 'Cundinamarca',
        postalCode: '110231',
        status: 'CREATED',
        createdAt: '2026-09-23T00:00:00.000Z',
      });
    });

    it('does not include customerId in the response (PII minimization)', async () => {
      const getDelivery = {
        execute: () => okAsync(buildDelivery()),
      } as unknown as GetDeliveryUseCase;
      const controller = new DeliveriesController(getDelivery);

      const result = await controller.getById('delivery-1');

      expect(result).not.toHaveProperty('customerId');
    });

    it('omits postalCode when the delivery has none', async () => {
      const delivery = buildDelivery({ postalCode: undefined });
      const getDelivery = { execute: () => okAsync(delivery) } as unknown as GetDeliveryUseCase;
      const controller = new DeliveriesController(getDelivery);

      const result = await controller.getById('delivery-1');

      expect(result.postalCode).toBeUndefined();
    });

    it('throws the DomainError when the delivery is not found', async () => {
      const notFound = new NotFoundError('Delivery missing-id not found');
      const getDelivery = { execute: () => errAsync(notFound) } as unknown as GetDeliveryUseCase;
      const controller = new DeliveriesController(getDelivery);

      await expect(controller.getById('missing-id')).rejects.toBe(notFound);
    });
  });

  describe('GET /deliveries/:id route validation (HTTP)', () => {
    let app: INestApplication;

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        controllers: [DeliveriesController],
        providers: [
          { provide: GetDeliveryUseCase, useValue: { execute: () => okAsync(buildDelivery()) } },
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it('rejects a malformed (non-UUID) id with 400', async () => {
      await request(app.getHttpServer()).get('/deliveries/not-a-uuid').expect(400);
    });

    it('accepts a well-formed UUID id', async () => {
      await request(app.getHttpServer())
        .get('/deliveries/e1a6b6b0-6c9e-4a3a-9c1a-6f6f2b6b1a10')
        .expect(200);
    });
  });
});
