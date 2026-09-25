import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';

import { TOKEN_PORT, TokenPort } from '../../domain/ports/token.port';
import { RequestWithUserId } from './jwt-auth.guard';

const BEARER_PREFIX = 'Bearer ';

function extractBearerToken(request: Request): string | undefined {
  const header = request.headers.authorization;
  if (!header || !header.startsWith(BEARER_PREFIX)) {
    return undefined;
  }
  return header.slice(BEARER_PREFIX.length);
}

/**
 * PR6 design amendment, hard rule #2: authentication can NEVER fail a
 * checkout. Unlike `JwtAuthGuard`, this guard ALWAYS resolves `true` — a
 * missing header, wrong scheme, a rejected token (expired, tampered,
 * malformed, wrong secret), or `TOKEN_PORT.verify()` outright THROWING
 * (synchronously, or asynchronously via a rejected Promise — `TokenPort` is
 * declared synchronous today, but a future implementation, e.g. one that
 * awaits a remote JWKS fetch, could still throw either way) all silently
 * fall back to `request.userId` staying `undefined` (proceed as guest),
 * instead of ever propagating an exception. Only ever used on
 * `POST /transactions`.
 */
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(@Inject(TOKEN_PORT) private readonly tokens: TokenPort) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUserId>();
    const token = extractBearerToken(request);

    if (!token) {
      return true;
    }

    try {
      // `Promise.resolve(...)` normalizes both a synchronous return value
      // and a Promise into one awaitable path, so a rejected Promise from a
      // future async `TokenPort` implementation is caught here exactly like
      // a synchronous throw would be — either way, this guard never lets it
      // escape and fail the checkout.
      const result = await Promise.resolve(this.tokens.verify(token));
      if (result.isOk()) {
        request.userId = result.value.sub;
      }
    } catch {
      // Auth can never fail a checkout — any throw, from any TokenPort
      // implementation, silently leaves request.userId unset (guest).
    }

    return true;
  }
}
