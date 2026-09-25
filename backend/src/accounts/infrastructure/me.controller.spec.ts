import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { NotFoundError, UnauthorizedError } from '../../shared/errors/domain-error';
import { err, errAsync, ok, okAsync } from '../../shared/result/result.types';
import { GetMeUseCase } from '../application/get-me.use-case';
import { ListMyTransactionsUseCase } from '../application/list-my-transactions.use-case';
import { UpdatePreferencesUseCase } from '../application/update-preferences.use-case';
import { TOKEN_PORT, TokenPort } from '../domain/ports/token.port';
import { buildUser } from '../test/user.fixtures';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { MeController } from './me.controller';

function buildController(overrides: {
  getMeUseCase?: GetMeUseCase;
  updatePreferencesUseCase?: UpdatePreferencesUseCase;
  listMyTransactionsUseCase?: ListMyTransactionsUseCase;
} = {}) {
  return new MeController(
    overrides.getMeUseCase ?? ({} as unknown as GetMeUseCase),
    overrides.updatePreferencesUseCase ?? ({} as unknown as UpdatePreferencesUseCase),
    overrides.listMyTransactionsUseCase ?? ({} as unknown as ListMyTransactionsUseCase),
  );
}

const preferences = {
  phone: '+573001234567',
  address: 'Cra 1 # 2-3',
  city: 'Bogota',
  region: 'Cundinamarca',
  postalCode: '110111',
};

describe('MeController', () => {
  describe('getMe', () => {
    it('returns the profile without password/hash', async () => {
      const user = buildUser({ id: 'user-1', preferences });
      const getMeUseCase = { execute: () => okAsync(user) } as unknown as GetMeUseCase;
      const controller = buildController({ getMeUseCase });

      const result = await controller.getMe({ userId: 'user-1' } as never);

      expect(result).toEqual({
        userId: 'user-1',
        email: 'jane.doe@example.com',
        fullName: 'Jane Doe',
        preferences,
      });
      expect(Object.keys(result)).not.toContain('passwordHash');
      expect(JSON.stringify(result)).not.toMatch(/passwordHash/);
    });

    it('throws the DomainError (404) when the account no longer exists', async () => {
      const notFound = new NotFoundError('User user-1 not found');
      const getMeUseCase = { execute: () => errAsync(notFound) } as unknown as GetMeUseCase;
      const controller = buildController({ getMeUseCase });

      await expect(controller.getMe({ userId: 'user-1' } as never)).rejects.toBe(notFound);
    });

    it('omits preferences entirely before the first PUT /me/preferences', async () => {
      const user = buildUser({ id: 'user-1' });
      const getMeUseCase = { execute: () => okAsync(user) } as unknown as GetMeUseCase;
      const controller = buildController({ getMeUseCase });

      const result = await controller.getMe({ userId: 'user-1' } as never);

      expect(result.preferences).toBeUndefined();
    });
  });

  describe('updatePreferences', () => {
    it('persists and returns the updated profile', async () => {
      const user = buildUser({ id: 'user-1', preferences });
      const updatePreferencesUseCase = { execute: () => okAsync(user) } as unknown as UpdatePreferencesUseCase;
      const controller = buildController({ updatePreferencesUseCase });

      const result = await controller.updatePreferences({ userId: 'user-1' } as never, preferences);

      expect(result.preferences).toEqual(preferences);
    });

    it('throws the DomainError (404) when the account no longer exists', async () => {
      const notFound = new NotFoundError('User deleted-user not found');
      const updatePreferencesUseCase = { execute: () => errAsync(notFound) } as unknown as UpdatePreferencesUseCase;
      const controller = buildController({ updatePreferencesUseCase });

      await expect(controller.updatePreferences({ userId: 'deleted-user' } as never, preferences)).rejects.toBe(
        notFound,
      );
    });
  });

  describe('getMyTransactions', () => {
    it('returns the mapped history list', async () => {
      const historyItem = {
        transactionId: 'tx-1',
        productId: 'prod-1',
        productName: 'Wireless Headphones',
        amount: 1_350_000,
        status: 'APPROVED' as const,
        createdAt: '2026-09-23T00:00:00.000Z',
        delivery: { address: 'Cra 7 # 71-21', city: 'Bogota', region: 'Cundinamarca', postalCode: '110231', status: 'CREATED' as const },
      };
      const listMyTransactionsUseCase = {
        execute: () => okAsync([historyItem]),
      } as unknown as ListMyTransactionsUseCase;
      const controller = buildController({ listMyTransactionsUseCase });

      const result = await controller.getMyTransactions({ userId: 'user-1' } as never);

      expect(result).toEqual([historyItem]);
    });

    it('returns an empty array when the user has no purchases', async () => {
      const listMyTransactionsUseCase = { execute: () => okAsync([]) } as unknown as ListMyTransactionsUseCase;
      const controller = buildController({ listMyTransactionsUseCase });

      const result = await controller.getMyTransactions({ userId: 'user-1' } as never);

      expect(result).toEqual([]);
    });

    it('throws the DomainError when the use case fails', async () => {
      const notFound = new NotFoundError('boom');
      const listMyTransactionsUseCase = { execute: () => errAsync(notFound) } as unknown as ListMyTransactionsUseCase;
      const controller = buildController({ listMyTransactionsUseCase });

      await expect(controller.getMyTransactions({ userId: 'user-1' } as never)).rejects.toBe(notFound);
    });
  });

  describe('HTTP route validation (behind JwtAuthGuard)', () => {
    let app: INestApplication;
    const user = buildUser({ id: 'user-1', preferences });

    beforeAll(async () => {
      const tokens: TokenPort = {
        issue: jest.fn(),
        verify: jest.fn((token: string) =>
          token === 'valid.jwt.token'
            ? ok({ sub: 'user-1', email: 'jane.doe@example.com' })
            : err(new UnauthorizedError('Invalid or expired token')),
        ),
      };

      const moduleRef = await Test.createTestingModule({
        controllers: [MeController],
        providers: [
          JwtAuthGuard,
          { provide: TOKEN_PORT, useValue: tokens },
          { provide: GetMeUseCase, useValue: { execute: () => okAsync(user) } },
          { provide: UpdatePreferencesUseCase, useValue: { execute: () => okAsync(user) } },
          { provide: ListMyTransactionsUseCase, useValue: { execute: () => okAsync([]) } },
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it('rejects GET /me with no Authorization header (401)', async () => {
      await request(app.getHttpServer()).get('/me').expect(401);
    });

    it('accepts GET /me with a valid Bearer token (200)', async () => {
      const response = await request(app.getHttpServer())
        .get('/me')
        .set('Authorization', 'Bearer valid.jwt.token')
        .expect(200);
      expect(response.body.userId).toBe('user-1');
    });

    it('rejects PUT /me/preferences with no Authorization header (401)', async () => {
      await request(app.getHttpServer()).put('/me/preferences').send(preferences).expect(401);
    });

    it('rejects GET /me/transactions with no Authorization header (401)', async () => {
      await request(app.getHttpServer()).get('/me/transactions').expect(401);
    });

    it('accepts GET /me/transactions with a valid Bearer token (200)', async () => {
      const response = await request(app.getHttpServer())
        .get('/me/transactions')
        .set('Authorization', 'Bearer valid.jwt.token')
        .expect(200);
      expect(response.body).toEqual([]);
    });

    it('rejects PUT /me/preferences with a missing required field (400)', async () => {
      const { address: _address, ...rest } = preferences;
      await request(app.getHttpServer())
        .put('/me/preferences')
        .set('Authorization', 'Bearer valid.jwt.token')
        .send(rest)
        .expect(400);
    });

    it('accepts PUT /me/preferences without the optional postalCode (200)', async () => {
      const { postalCode: _postalCode, ...rest } = preferences;
      await request(app.getHttpServer())
        .put('/me/preferences')
        .set('Authorization', 'Bearer valid.jwt.token')
        .send(rest)
        .expect(200);
    });

    it('accepts a well-formed PUT /me/preferences (200)', async () => {
      await request(app.getHttpServer())
        .put('/me/preferences')
        .set('Authorization', 'Bearer valid.jwt.token')
        .send(preferences)
        .expect(200);
    });
  });
});
