import { ExecutionContext } from '@nestjs/common';

import { UnauthorizedError } from '../../../shared/errors/domain-error';
import { err, ok } from '../../../shared/result/result.types';
import { TokenPort } from '../../domain/ports/token.port';
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';

function buildContext(headers: Record<string, string | undefined>): ExecutionContext {
  const request: { headers: Record<string, string | undefined>; userId?: string } = { headers };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('OptionalJwtAuthGuard', () => {
  it('allows the request and sets request.userId when the Bearer token is valid', async () => {
    const tokens: TokenPort = {
      issue: jest.fn(),
      verify: jest.fn().mockReturnValue(ok({ sub: 'user-1', email: 'jane.doe@example.com' })),
    };
    const guard = new OptionalJwtAuthGuard(tokens);
    const context = buildContext({ authorization: 'Bearer valid.jwt.token' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    const request = context.switchToHttp().getRequest<{ userId?: string }>();
    expect(request.userId).toBe('user-1');
  });

  it('allows the request and leaves request.userId undefined when no Authorization header is sent (guest)', async () => {
    const tokens: TokenPort = { issue: jest.fn(), verify: jest.fn() };
    const guard = new OptionalJwtAuthGuard(tokens);
    const context = buildContext({});

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(tokens.verify).not.toHaveBeenCalled();
    const request = context.switchToHttp().getRequest<{ userId?: string }>();
    expect(request.userId).toBeUndefined();
  });

  it('allows the request and leaves request.userId undefined when the header is not a Bearer scheme', async () => {
    const tokens: TokenPort = { issue: jest.fn(), verify: jest.fn() };
    const guard = new OptionalJwtAuthGuard(tokens);
    const context = buildContext({ authorization: 'Basic dXNlcjpwYXNz' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    const request = context.switchToHttp().getRequest<{ userId?: string }>();
    expect(request.userId).toBeUndefined();
  });

  it('allows the request and leaves request.userId undefined when TOKEN_PORT.verify rejects the token (expired/tampered) — NEVER 401', async () => {
    const tokens: TokenPort = {
      issue: jest.fn(),
      verify: jest.fn().mockReturnValue(err(new UnauthorizedError('Invalid or expired token'))),
    };
    const guard = new OptionalJwtAuthGuard(tokens);
    const context = buildContext({ authorization: 'Bearer expired.jwt.token' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    const request = context.switchToHttp().getRequest<{ userId?: string }>();
    expect(request.userId).toBeUndefined();
  });

  it('allows the request and leaves request.userId undefined when TOKEN_PORT.verify throws SYNCHRONOUSLY — auth can never fail a checkout', async () => {
    const tokens: TokenPort = {
      issue: jest.fn(),
      verify: jest.fn(() => {
        throw new Error('unexpected verifier crash');
      }),
    };
    const guard = new OptionalJwtAuthGuard(tokens);
    const context = buildContext({ authorization: 'Bearer some.jwt.token' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    const request = context.switchToHttp().getRequest<{ userId?: string }>();
    expect(request.userId).toBeUndefined();
  });

  it('allows the request and leaves request.userId undefined when TOKEN_PORT.verify returns a rejected Promise — a future async TokenPort implementation', async () => {
    const tokens: TokenPort = {
      issue: jest.fn(),
      // Not representable by the current synchronous TokenPort type, but the
      // guard must defend against it anyway (a future adapter could await a
      // remote JWKS fetch before verifying) — hence casting past the type here.
      verify: jest.fn(() => Promise.reject(new Error('remote verifier timeout'))) as unknown as TokenPort['verify'],
    };
    const guard = new OptionalJwtAuthGuard(tokens);
    const context = buildContext({ authorization: 'Bearer some.jwt.token' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    const request = context.switchToHttp().getRequest<{ userId?: string }>();
    expect(request.userId).toBeUndefined();
  });
});
