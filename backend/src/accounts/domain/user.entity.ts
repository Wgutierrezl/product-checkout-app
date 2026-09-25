import { ValidationError } from '../../shared/errors/domain-error';
import { AppResult, err, ok } from '../../shared/result/result.types';

export interface UserPreferences {
  readonly phone?: string;
  readonly address?: string;
  readonly city?: string;
  readonly region?: string;
  readonly postalCode?: string;
}

export interface User {
  readonly id: string;
  readonly fullName: string;
  readonly email: string;
  /** bcryptjs hash — the plaintext password is never stored on this entity. */
  readonly passwordHash: string;
  readonly preferences?: UserPreferences;
}

export interface UserProps {
  id: string;
  fullName: string;
  email: string;
  passwordHash: string;
  preferences?: UserPreferences;
}

// Mirrors Customer.create's deliberately simple email format check — full
// RFC 5322 validation is out of scope; `class-validator`'s `@IsEmail()` on
// the HTTP DTO (PR3) provides the user-facing validation, this is the
// domain-layer safety net shared by every construction path.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Domain factory for `User`. Centralizes the invariants (required fields,
 * email format) so every construction path — DynamoDB reads, `register`'s
 * create flow, and tests — shares the same validation instead of
 * re-implementing it.
 */
export const User = {
  create(props: UserProps): AppResult<User> {
    const requiredFields: Array<[string, string]> = [
      ['id', props.id],
      ['fullName', props.fullName],
      ['email', props.email],
      ['passwordHash', props.passwordHash],
    ];
    const missing = requiredFields.find(([, value]) => !value);
    if (missing) {
      return err(new ValidationError(`User is missing required field: ${missing[0]}`));
    }

    if (!EMAIL_REGEX.test(props.email)) {
      return err(new ValidationError(`Invalid user email: ${props.email}`));
    }

    return ok({
      id: props.id,
      fullName: props.fullName,
      email: props.email,
      passwordHash: props.passwordHash,
      preferences: props.preferences,
    });
  },
};
