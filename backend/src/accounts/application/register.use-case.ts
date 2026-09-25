import { Inject, Injectable } from '@nestjs/common';
import { ResultAsync } from 'neverthrow';

import { ConflictError } from '../../shared/errors/domain-error';
import { ID_GENERATOR_PORT, IdGeneratorPort } from '../../shared/ports/id-generator.port';
import { AppResultAsync, errAsync } from '../../shared/result/result.types';
import { User } from '../domain/user.entity';
import { normalizeEmail } from '../domain/normalize-email';
import { PASSWORD_HASHER_PORT, PasswordHasherPort } from '../domain/ports/password-hasher.port';
import { USER_REPOSITORY_PORT, UserRepositoryPort } from '../domain/user.repository.port';

export interface RegisterCommand {
  fullName: string;
  email: string;
  password: string;
}

/**
 * ROP pipeline: reject on a pre-existing email (409, no hashing/write
 * performed) -> hash the plaintext password -> construct+validate the
 * `User` entity -> persist it via the email-uniqueness-guarded repository.
 *
 * The pre-check here is a fast path (avoids hashing/attempting a write for
 * the common case); `DynamoUserRepository.create()` is the actual source of
 * truth for uniqueness under a race — see its own `ConflictError` handling.
 */
@Injectable()
export class RegisterUseCase {
  constructor(
    @Inject(USER_REPOSITORY_PORT) private readonly users: UserRepositoryPort,
    @Inject(PASSWORD_HASHER_PORT) private readonly hasher: PasswordHasherPort,
    @Inject(ID_GENERATOR_PORT) private readonly ids: IdGeneratorPort,
  ) {}

  execute(command: RegisterCommand): AppResultAsync<User> {
    // Normalized once here (mirrors LoginUseCase) so a lookup against
    // findByEmail's exact-match GSI query catches a duplicate regardless of
    // the caller's input casing/whitespace — the DB-level guard item in
    // DynamoUserRepository.create is the ultimate source of truth for
    // uniqueness, but this fast path avoids an unnecessary hash+write
    // attempt for the common case.
    const email = normalizeEmail(command.email);

    return this.users.findByEmail(email).andThen((existing) => {
      if (existing) {
        return errAsync(new ConflictError(`A user with email ${email} already exists`));
      }

      return ResultAsync.fromSafePromise(this.hasher.hash(command.password)).andThen(
        (passwordHash) =>
          User.create({
            id: this.ids.newId(),
            fullName: command.fullName,
            email,
            passwordHash,
          }).asyncAndThen((user) => this.users.create(user)),
      );
    });
  }
}
