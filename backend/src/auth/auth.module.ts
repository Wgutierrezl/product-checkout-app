import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AppConfig } from '../shared/config/configuration';
import { TOKEN_PORT } from './domain/ports/token.port';
import { JwtAuthGuard } from './infrastructure/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from './infrastructure/guards/optional-jwt-auth.guard';
import { ACCOUNTS_JWT_SECRET, JwtTokenAdapter } from './infrastructure/jwt-token.adapter';

/**
 * Self-contained JWT authentication mechanism, extracted out of
 * `AccountsModule` to remove the `AccountsModule` <-> `TransactionsModule`
 * cycle (both used to reach for the guards via `forwardRef()`). This module
 * depends ONLY on `ConfigService` (global) — no dependency on `AccountsModule`
 * (the `User` domain), `TransactionsModule`, or any other bounded context —
 * so it can be imported plainly (no `forwardRef`) by anything that needs
 * `TOKEN_PORT`/`JwtAuthGuard`/`OptionalJwtAuthGuard`.
 *
 * Deliberately NOT `@Global()`: the guards must be resolvable through this
 * module's normal `imports`/`exports` DI graph (strict per-module scoping),
 * not via a non-strict/global lookup shortcut.
 */
@Module({
  providers: [
    JwtAuthGuard,
    OptionalJwtAuthGuard,
    { provide: TOKEN_PORT, useClass: JwtTokenAdapter },
    {
      provide: ACCOUNTS_JWT_SECRET,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        configService.getOrThrow<AppConfig['accounts']>('accounts').jwtSecret,
    },
  ],
  exports: [JwtAuthGuard, OptionalJwtAuthGuard, TOKEN_PORT],
})
export class AuthModule {}
