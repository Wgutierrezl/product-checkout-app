import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { DeliveriesModule } from '../deliveries/deliveries.module';
import { ProductsModule } from '../products/products.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { GetMeUseCase } from './application/get-me.use-case';
import { ListMyTransactionsUseCase } from './application/list-my-transactions.use-case';
import { LoginUseCase } from './application/login.use-case';
import { RegisterUseCase } from './application/register.use-case';
import { UpdatePreferencesUseCase } from './application/update-preferences.use-case';
import { PASSWORD_HASHER_PORT } from './domain/ports/password-hasher.port';
import { USER_REPOSITORY_PORT } from './domain/user.repository.port';
import { AuthController } from './infrastructure/auth.controller';
import { BcryptPasswordHasherAdapter } from './infrastructure/bcrypt-password-hasher.adapter';
import { DynamoUserRepository } from './infrastructure/dynamo-user.repository';
import { MeController } from './infrastructure/me.controller';

/**
 * `DYNAMO_DOCUMENT_CLIENT`/`CLOCK_PORT`/`ID_GENERATOR_PORT` are all global
 * (`DynamoModule`/`SharedKernelModule` on `AppModule`), so they don't need to
 * be imported here.
 *
 * `AuthModule` provides `JwtAuthGuard`/`OptionalJwtAuthGuard`/`TOKEN_PORT` —
 * it depends only on config, never on `AccountsModule` or `TransactionsModule`,
 * so importing it here is a plain, one-directional dependency (no
 * `forwardRef`). `TransactionsModule` is imported for
 * `TRANSACTION_REPOSITORY_PORT` (needed by `ListMyTransactionsUseCase`'s
 * `GET /me/transactions` join) — also plain, since `TransactionsModule`
 * itself only imports `AuthModule`, never `AccountsModule`. This removes the
 * `AccountsModule` <-> `TransactionsModule` cycle that used to require
 * `forwardRef` on both sides.
 */
@Module({
  imports: [AuthModule, ProductsModule, DeliveriesModule, TransactionsModule],
  controllers: [AuthController, MeController],
  providers: [
    RegisterUseCase,
    LoginUseCase,
    GetMeUseCase,
    UpdatePreferencesUseCase,
    ListMyTransactionsUseCase,
    { provide: USER_REPOSITORY_PORT, useClass: DynamoUserRepository },
    { provide: PASSWORD_HASHER_PORT, useClass: BcryptPasswordHasherAdapter },
  ],
  exports: [USER_REPOSITORY_PORT],
})
export class AccountsModule {}
