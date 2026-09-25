import { Inject, Injectable } from '@nestjs/common';
import jwt from 'jsonwebtoken';

import { UnauthorizedError } from '../../shared/errors/domain-error';
import { AppResult, err, ok } from '../../shared/result/result.types';
import { TokenClaims, TokenPort } from '../domain/ports/token.port';

export const ACCOUNTS_JWT_SECRET = Symbol('ACCOUNTS_JWT_SECRET');
/** ~1h, no refresh — per the signed-off decision (manual secret rotation only). */
export const ACCOUNTS_JWT_EXPIRES_IN_SECONDS = 3600;

/**
 * Thin `jsonwebtoken` wrapper, mirrors `SystemClockAdapter`'s single-purpose
 * adapter style. HS256 + a 1h expiry, no refresh token — the secret is
 * injected (see `auth.module.ts`), sourced from `AppConfig` (itself
 * populated from SSM in production, `.env` locally — see `ssm-bootstrap.ts`).
 */
@Injectable()
export class JwtTokenAdapter implements TokenPort {
  constructor(@Inject(ACCOUNTS_JWT_SECRET) private readonly secret: string) {}

  issue(claims: TokenClaims): string {
    return jwt.sign({ sub: claims.sub, email: claims.email }, this.secret, {
      algorithm: 'HS256',
      expiresIn: ACCOUNTS_JWT_EXPIRES_IN_SECONDS,
    });
  }

  verify(token: string): AppResult<TokenClaims> {
    try {
      const decoded = jwt.verify(token, this.secret, { algorithms: ['HS256'] });

      if (typeof decoded === 'string' || typeof decoded.sub !== 'string' || typeof decoded.email !== 'string') {
        return err(new UnauthorizedError('Malformed token payload'));
      }

      return ok({ sub: decoded.sub, email: decoded.email as string });
    } catch {
      // Never leak WHY verification failed (expired vs tampered vs
      // malformed vs wrong secret) — all map to the same generic 401, same
      // rationale as LoginUseCase's "no credential detail leaked" rule.
      return err(new UnauthorizedError('Invalid or expired token'));
    }
  }
}
