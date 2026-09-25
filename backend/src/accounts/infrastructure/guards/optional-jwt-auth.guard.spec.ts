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
  it('allows the request and sets request.userId when the Bearer token is valid', () => {
    const tokens: TokenPort = {
      issue: jest.fn(),
      verify: jest.fn().mockReturnValue(ok({ sub: 'user-1', email: 'jane.doe@example.com' })),
    };
    const guard = new OptionalJwtAuthGuard(tokens);
    const context = buildContext({ authorization: 'Bearer valid.jwt.token' });

    expect(guard.canActivate(context)).toBe(true);
    const request = context.switchToHttp().getRequest<{ userId?: string }>();
    expect(request.userId).toBe('user-1');
  });

  it('allows the request and leaves request.userId undefined when no Authorization header is sent (guest)', () => {
    const tokens: TokenPort = { issue: jest.fn(), verify: jest.fn() };
    const guard = new OptionalJwtAuthGuard(tokens);
    const context = buildContext({});

    expect(guard.canActivate(context)).toBe(true);
    expect(tokens.verify).not.toHaveBeenCalled();
    const request = context.switchToHttp().getRequest<{ userId?: string }>();
    expect(request.userId).toBeUndefined();
  });

  it('allows the request and leaves request.userId undefined when the header is not a Bearer scheme', () => {
    const tokens: TokenPort = { issue: jest.fn(), verify: jest.fn() };
    const guard = new OptionalJwtAuthGuard(tokens);
    const context = buildContext({ authorization: 'Basic dXNlcjpwYXNz' });

    expect(guard.canActivate(context)).toBe(true);
    const request = context.switchToHttp().getRequest<{ userId?: string }>();
    expect(request.userId).toBeUndefined();
  });

  it('allows the request and leaves request.userId undefined when TOKEN_PORT.verify rejects the token (expired/tampered) — NEVER 401', () => {
    const tokens: TokenPort = {
      issue: jest.fn(),
      verify: jest.fn().mockReturnValue(err(new UnauthorizedError('Invalid or expired token'))),
    };
    const guard = new OptionalJwtAuthGuard(tokens);
    const context = buildContext({ authorization: 'Bearer expired.jwt.token' });

    expect(guard.canActivate(context)).toBe(true);
    const request = context.switchToHttp().getRequest<{ userId?: string }>();
    expect(request.userId).toBeUndefined();
  });
});
