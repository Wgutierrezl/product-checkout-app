import { ExecutionContext, UnauthorizedException } from '@nestjs/common';

import { UnauthorizedError } from '../../../shared/errors/domain-error';
import { err, ok } from '../../../shared/result/result.types';
import { TokenPort } from '../../domain/ports/token.port';
import { JwtAuthGuard } from './jwt-auth.guard';

function buildContext(headers: Record<string, string | undefined>): ExecutionContext {
  const request: { headers: Record<string, string | undefined>; userId?: string } = { headers };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  it('allows the request and sets request.userId when the Bearer token is valid', () => {
    const tokens: TokenPort = {
      issue: jest.fn(),
      verify: jest.fn().mockReturnValue(ok({ sub: 'user-1', email: 'jane.doe@example.com' })),
    };
    const guard = new JwtAuthGuard(tokens);
    const context = buildContext({ authorization: 'Bearer valid.jwt.token' });

    expect(guard.canActivate(context)).toBe(true);
    expect(tokens.verify).toHaveBeenCalledWith('valid.jwt.token');
    const request = context.switchToHttp().getRequest<{ userId?: string }>();
    expect(request.userId).toBe('user-1');
  });

  it('throws UnauthorizedException when the Authorization header is missing', () => {
    const tokens: TokenPort = { issue: jest.fn(), verify: jest.fn() };
    const guard = new JwtAuthGuard(tokens);
    const context = buildContext({});

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(tokens.verify).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedException when the header is not a Bearer scheme', () => {
    const tokens: TokenPort = { issue: jest.fn(), verify: jest.fn() };
    const guard = new JwtAuthGuard(tokens);
    const context = buildContext({ authorization: 'Basic dXNlcjpwYXNz' });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(tokens.verify).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedException when TOKEN_PORT.verify rejects the token (expired/tampered)', () => {
    const tokens: TokenPort = {
      issue: jest.fn(),
      verify: jest.fn().mockReturnValue(err(new UnauthorizedError('Invalid or expired token'))),
    };
    const guard = new JwtAuthGuard(tokens);
    const context = buildContext({ authorization: 'Bearer expired.jwt.token' });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });
});
