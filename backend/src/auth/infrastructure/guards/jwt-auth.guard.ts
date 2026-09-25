import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

import { TOKEN_PORT, TokenPort } from '../../domain/ports/token.port';

export interface RequestWithUserId extends Request {
  userId?: string;
}

const BEARER_PREFIX = 'Bearer ';

function extractBearerToken(request: Request): string | undefined {
  const header = request.headers.authorization;
  if (!header || !header.startsWith(BEARER_PREFIX)) {
    return undefined;
  }
  return header.slice(BEARER_PREFIX.length);
}

/**
 * Requires a valid `Authorization: Bearer <jwt>` header. Missing header,
 * wrong scheme, or `TOKEN_PORT.verify()` rejecting the token (expired,
 * tampered, malformed, wrong secret) all throw the same `UnauthorizedException`
 * (401) — never distinguishing WHY, same "no detail leaked" rule as
 * `LoginUseCase`. On success, sets `request.userId` for downstream handlers.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(@Inject(TOKEN_PORT) private readonly tokens: TokenPort) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUserId>();
    const token = extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const result = this.tokens.verify(token);
    if (result.isErr()) {
      throw new UnauthorizedException(result.error.message);
    }

    request.userId = result.value.sub;
    return true;
  }
}
