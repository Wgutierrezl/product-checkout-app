import { Inject, Injectable } from '@nestjs/common';
import { ResultAsync } from 'neverthrow';

import { UnauthorizedError } from '../../shared/errors/domain-error';
import { AppResultAsync, errAsync, okAsync } from '../../shared/result/result.types';
import { User } from '../domain/user.entity';
import { PASSWORD_HASHER_PORT, PasswordHasherPort } from '../domain/ports/password-hasher.port';
import { TOKEN_PORT, TokenPort } from '../domain/ports/token.port';
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
 * ROP pipeline: look up by email -> compare the bcrypt hash -> issue a JWT.
 * Both "unknown email" and "wrong password" return the exact same
 * `UnauthorizedError` message and HTTP status (401), per spec's "no
 * user/credential detail leaked" requirement — a timing-based user
 * enumeration side channel is a known, accepted limitation of bcrypt.compare
 * vs. a DB lookup and out of scope for this change.
 */
@Injectable()
export class LoginUseCase {
  constructor(
    @Inject(USER_REPOSITORY_PORT) private readonly users: UserRepositoryPort,
    @Inject(PASSWORD_HASHER_PORT) private readonly hasher: PasswordHasherPort,
    @Inject(TOKEN_PORT) private readonly tokens: TokenPort,
  ) {}

  execute(command: LoginCommand): AppResultAsync<LoginResult> {
    return this.users.findByEmail(command.email).andThen((user) => {
      if (!user) {
        return errAsync(new UnauthorizedError(INVALID_CREDENTIALS_MESSAGE));
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
