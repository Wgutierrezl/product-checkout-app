import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { PaymentGatewayError } from '../../shared/errors/domain-error';
import { errAsync, okAsync } from '../../shared/result/result.types';
import { buildAcceptanceTokens } from '../../shared/payment-gateway/test/payment-gateway.fixtures';
import { GetPaymentAcceptanceUseCase } from '../application/get-payment-acceptance.use-case';
import { PaymentAcceptanceController } from './payment-acceptance.controller';

describe('PaymentAcceptanceController', () => {
  describe('get', () => {
    it('returns both tokens with their permalinks', async () => {
      const useCase = {
        execute: () => okAsync(buildAcceptanceTokens()),
      } as unknown as GetPaymentAcceptanceUseCase;
      const controller = new PaymentAcceptanceController(useCase);

      const result = await controller.get();

      expect(result).toEqual({
        acceptanceToken: 'acc-token-1',
        acceptanceTokenPermalink: 'https://gateway.test/acceptance',
        acceptPersonalAuth: 'auth-token-1',
        acceptPersonalAuthPermalink: 'https://gateway.test/personal-data-auth',
      });
    });

    it('throws the DomainError when the gateway is unreachable', async () => {
      const error = new PaymentGatewayError('down');
      const useCase = { execute: () => errAsync(error) } as unknown as GetPaymentAcceptanceUseCase;
      const controller = new PaymentAcceptanceController(useCase);

      await expect(controller.get()).rejects.toBe(error);
    });
  });

  describe('GET /payment-acceptance route (HTTP)', () => {
    let app: INestApplication;

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        controllers: [PaymentAcceptanceController],
        providers: [
          {
            provide: GetPaymentAcceptanceUseCase,
            useValue: { execute: () => okAsync(buildAcceptanceTokens()) },
          },
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it('responds 200 with the mapped tokens', async () => {
      const response = await request(app.getHttpServer()).get('/payment-acceptance').expect(200);

      expect(response.body).toEqual({
        acceptanceToken: 'acc-token-1',
        acceptanceTokenPermalink: 'https://gateway.test/acceptance',
        acceptPersonalAuth: 'auth-token-1',
        acceptPersonalAuthPermalink: 'https://gateway.test/personal-data-auth',
      });
    });
  });
});
