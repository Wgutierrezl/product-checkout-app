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
 * checkout. Unlike `JwtAuthGuard`, this guard ALWAYS returns `true` — a
 * missing header, wrong scheme, or a rejected token (expired, tampered,
 * malformed, wrong secret) all silently fall back to `request.userId`
 * staying `undefined` (proceed as guest), instead of throwing
 * `UnauthorizedException`. Only ever used on `POST /transactions`.
 */
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(@Inject(TOKEN_PORT) private readonly tokens: TokenPort) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUserId>();
    const token = extractBearerToken(request);

    if (!token) {
      return true;
    }

    const result = this.tokens.verify(token);
    if (result.isOk()) {
      request.userId = result.value.sub;
    }

    return true;
  }
}
