import { Inject, Injectable } from '@nestjs/common';

import { AppResultAsync } from '../../shared/result/result.types';
import { User } from '../domain/user.entity';
import { USER_REPOSITORY_PORT, UserRepositoryPort } from '../domain/user.repository.port';

/**
 * Thin read-only pass-through: `JwtAuthGuard` already resolved and verified
 * the caller's identity (`request.userId`, the JWT `sub`), so there is no
 * further authorization decision to make here — just look the user up.
 * `NotFoundError` (e.g. the account was deleted after the token was issued)
 * propagates as-is; `MeController` maps it to a 404 via `DomainErrorFilter`.
 */
@Injectable()
export class GetMeUseCase {
  constructor(@Inject(USER_REPOSITORY_PORT) private readonly users: UserRepositoryPort) {}

  execute(userId: string): AppResultAsync<User> {
    return this.users.findById(userId);
  }
}
