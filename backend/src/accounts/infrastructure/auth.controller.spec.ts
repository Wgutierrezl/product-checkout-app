import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { ConflictError, UnauthorizedError } from '../../shared/errors/domain-error';
import { errAsync, okAsync } from '../../shared/result/result.types';
import { LoginUseCase } from '../application/login.use-case';
import { RegisterUseCase } from '../application/register.use-case';
import { buildUser } from '../test/user.fixtures';
import { AuthController } from './auth.controller';

// @nestjs/throttler's internal metadata keys for the unnamed ('default')
// throttler; not publicly exported as named constants (same pattern as
// transactions.controller.spec.ts).
const THROTTLER_LIMIT_METADATA_KEY = 'THROTTLER:LIMITdefault';
const THROTTLER_TTL_METADATA_KEY = 'THROTTLER:TTLdefault';

function buildController(overrides: {
  registerUseCase?: RegisterUseCase;
  loginUseCase?: LoginUseCase;
} = {}) {
  return new AuthController(
    overrides.registerUseCase ?? ({} as unknown as RegisterUseCase),
    overrides.loginUseCase ?? ({} as unknown as LoginUseCase),
  );
}

function validRegisterBody() {
  return {
    fullName: 'Jane Doe',
    email: 'jane.doe@example.com',
    password: 'correct-horse-battery-staple',
  };
}

function validLoginBody() {
  return { email: 'jane.doe@example.com', password: 'correct-horse-battery-staple' };
}

describe('AuthController', () => {
  describe('rate limiting', () => {
    it('throttles register to 5 requests per 60s per client — the signed-off brute-force default', () => {
      const limit = Reflect.getMetadata(THROTTLER_LIMIT_METADATA_KEY, AuthController.prototype.register);
      const ttl = Reflect.getMetadata(THROTTLER_TTL_METADATA_KEY, AuthController.prototype.register);

      expect(limit).toBe(5);
      expect(ttl).toBe(60_000);
    });

    it('throttles login to 5 requests per 60s per client — the signed-off brute-force default', () => {
      const limit = Reflect.getMetadata(THROTTLER_LIMIT_METADATA_KEY, AuthController.prototype.login);
      const ttl = Reflect.getMetadata(THROTTLER_TTL_METADATA_KEY, AuthController.prototype.login);

      expect(limit).toBe(5);
      expect(ttl).toBe(60_000);
    });
  });

  describe('register', () => {
    it('returns the created user (no password/hash) on success', async () => {
      const user = buildUser();
      const registerUseCase = { execute: () => okAsync(user) } as unknown as RegisterUseCase;
      const controller = buildController({ registerUseCase });

      const result = await controller.register(validRegisterBody());

      expect(result).toEqual({ userId: 'user-1', fullName: 'Jane Doe', email: 'jane.doe@example.com' });
      expect(Object.keys(result)).not.toContain('passwordHash');
    });

    it('throws the DomainError (409) when the email is already registered', async () => {
      const conflict = new ConflictError('A user with email jane.doe@example.com already exists');
      const registerUseCase = { execute: () => errAsync(conflict) } as unknown as RegisterUseCase;
      const controller = buildController({ registerUseCase });

      await expect(controller.register(validRegisterBody())).rejects.toBe(conflict);
    });
  });

  describe('login', () => {
    it('returns an access token on success', async () => {
      const user = buildUser();
      const loginUseCase = {
        execute: () => okAsync({ accessToken: 'signed.jwt.token', user }),
      } as unknown as LoginUseCase;
      const controller = buildController({ loginUseCase });

      const result = await controller.login(validLoginBody());

      expect(result).toEqual({
        accessToken: 'signed.jwt.token',
        tokenType: 'Bearer',
        expiresIn: 3600,
        userId: 'user-1',
        email: 'jane.doe@example.com',
        fullName: 'Jane Doe',
      });
      expect(Object.keys(result)).not.toContain('passwordHash');
      expect(JSON.stringify(result)).not.toMatch(/passwordHash|\$2a\$10\$/);
    });

    it('throws the DomainError (401) on bad credentials', async () => {
      const unauthorized = new UnauthorizedError('Invalid email or password');
      const loginUseCase = { execute: () => errAsync(unauthorized) } as unknown as LoginUseCase;
      const controller = buildController({ loginUseCase });

      await expect(controller.login(validLoginBody())).rejects.toBe(unauthorized);
    });
  });

  describe('HTTP route validation', () => {
    let app: INestApplication;
    const user = buildUser();

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        controllers: [AuthController],
        providers: [
          { provide: RegisterUseCase, useValue: { execute: () => okAsync(user) } },
          {
            provide: LoginUseCase,
            useValue: { execute: () => okAsync({ accessToken: 'signed.jwt.token', user }) },
          },
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      app.useGlobalPipes(
        new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
      );
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it('rejects register with a missing field (400)', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'jane.doe@example.com', password: 'correct-horse-battery-staple' })
        .expect(400);
    });

    it('rejects register with an invalid email (400)', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ ...validRegisterBody(), email: 'not-an-email' })
        .expect(400);
    });

    it('rejects register with a short password (400)', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ ...validRegisterBody(), password: 'short' })
        .expect(400);
    });

    it('rejects register with an unknown extra field (400, forbidNonWhitelisted)', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ ...validRegisterBody(), isAdmin: true })
        .expect(400);
    });

    it('accepts a well-formed register request (201)', async () => {
      await request(app.getHttpServer()).post('/auth/register').send(validRegisterBody()).expect(201);
    });

    it('rejects login with a missing password (400)', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'jane.doe@example.com' })
        .expect(400);
    });

    it('accepts a well-formed login request (200)', async () => {
      await request(app.getHttpServer()).post('/auth/login').send(validLoginBody()).expect(200);
    });
  });
});
