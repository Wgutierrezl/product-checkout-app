import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AppConfig } from '../shared/config/configuration';
import { GetMeUseCase } from './application/get-me.use-case';
import { LoginUseCase } from './application/login.use-case';
import { RegisterUseCase } from './application/register.use-case';
import { UpdatePreferencesUseCase } from './application/update-preferences.use-case';
import { PASSWORD_HASHER_PORT } from './domain/ports/password-hasher.port';
import { TOKEN_PORT } from './domain/ports/token.port';
import { USER_REPOSITORY_PORT } from './domain/user.repository.port';
import { AuthController } from './infrastructure/auth.controller';
import { BcryptPasswordHasherAdapter } from './infrastructure/bcrypt-password-hasher.adapter';
import { DynamoUserRepository } from './infrastructure/dynamo-user.repository';
import { JwtAuthGuard } from './infrastructure/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from './infrastructure/guards/optional-jwt-auth.guard';
import { ACCOUNTS_JWT_SECRET, JwtTokenAdapter } from './infrastructure/jwt-token.adapter';
import { MeController } from './infrastructure/me.controller';

/**
 * `DYNAMO_DOCUMENT_CLIENT`/`CLOCK_PORT`/`ID_GENERATOR_PORT` are all global
 * (`DynamoModule`/`SharedKernelModule` on `AppModule`), so they don't need to
 * be imported here — same pattern as `TransactionsModule`.
 */
@Module({
  controllers: [AuthController, MeController],
  providers: [
    RegisterUseCase,
    LoginUseCase,
    GetMeUseCase,
    UpdatePreferencesUseCase,
    JwtAuthGuard,
    OptionalJwtAuthGuard,
    { provide: USER_REPOSITORY_PORT, useClass: DynamoUserRepository },
    { provide: PASSWORD_HASHER_PORT, useClass: BcryptPasswordHasherAdapter },
    { provide: TOKEN_PORT, useClass: JwtTokenAdapter },
    {
      provide: ACCOUNTS_JWT_SECRET,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        configService.getOrThrow<AppConfig['accounts']>('accounts').jwtSecret,
    },
  ],
  // Exported so TransactionsModule can apply OptionalJwtAuthGuard on
  // POST /transactions (JwtAuthGuard itself is only ever used inside this
  // module's own controllers — MeController).
  exports: [OptionalJwtAuthGuard, TOKEN_PORT, USER_REPOSITORY_PORT],
})
export class AccountsModule {}
