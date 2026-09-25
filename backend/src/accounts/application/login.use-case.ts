import { Inject, Injectable } from '@nestjs/common';
import { ResultAsync } from 'neverthrow';

import { TOKEN_PORT, TokenPort } from '../../auth/domain/ports/token.port';
import { UnauthorizedError } from '../../shared/errors/domain-error';
import { AppResultAsync, errAsync, okAsync } from '../../shared/result/result.types';
import { User } from '../domain/user.entity';
import { normalizeEmail } from '../domain/normalize-email';
import { PASSWORD_HASHER_PORT, PasswordHasherPort } from '../domain/ports/password-hasher.port';
import { USER_REPOSITORY_PORT, UserRepositoryPort } from '../domain/user.repository.port';

export interface LoginCommand {
  email: string;
  password: string;
}

export interface LoginResult {
  accessToken: string;
  user: User;
}

/** Generic message on every failure path — never reveals whether the email is registered. */
const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password';

/**
 * Static, precomputed bcrypt hash (cost 10, matches `BCRYPT_COST_FACTOR`) of
 * an arbitrary, never-used dummy password. Run through `hasher.compare()` on
 * the "email not found" path so that branch costs the same ~bcrypt-shaped
 * time as a real "wrong password" comparison — closing the response-time
 * side channel that would otherwise let an attacker enumerate registered
 * emails by timing alone (a real lookup + bcrypt.compare vs. an instant
 * "not found" return are trivially distinguishable without this).
 */
const DUMMY_PASSWORD_HASH = '$2b$10$BtoGlLBbMIxhHpIo2J5nYO7l5WhQZG6qp99pepn4gOFvP86BFRtu.';

/**
 * ROP pipeline: normalize + look up by email -> compare the bcrypt hash ->
 * issue a JWT. Both "unknown email" and "wrong password" return the exact
 * same `UnauthorizedError` message and HTTP status (401), per spec's "no
 * user/credential detail leaked" requirement, AND now take the same
 * shape of work (one bcrypt compare each) so their response times don't
 * leak which case occurred either — see `DUMMY_PASSWORD_HASH` above.
 */
@Injectable()
export class LoginUseCase {
  constructor(
    @Inject(USER_REPOSITORY_PORT) private readonly users: UserRepositoryPort,
    @Inject(PASSWORD_HASHER_PORT) private readonly hasher: PasswordHasherPort,
    @Inject(TOKEN_PORT) private readonly tokens: TokenPort,
  ) {}

  execute(command: LoginCommand): AppResultAsync<LoginResult> {
    const email = normalizeEmail(command.email);

    return this.users.findByEmail(email).andThen((user) => {
      if (!user) {
        return ResultAsync.fromSafePromise(
          this.hasher.compare(command.password, DUMMY_PASSWORD_HASH),
        ).andThen(() => errAsync(new UnauthorizedError(INVALID_CREDENTIALS_MESSAGE)));
      }

      return ResultAsync.fromSafePromise(
        this.hasher.compare(command.password, user.passwordHash),
      ).andThen((matches) => {
        if (!matches) {
          return errAsync(new UnauthorizedError(INVALID_CREDENTIALS_MESSAGE));
        }

        const accessToken = this.tokens.issue({ sub: user.id, email: user.email });
        return okAsync({ accessToken, user });
      });
    });
  }
}
