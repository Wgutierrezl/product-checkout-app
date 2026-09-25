import { ValidationError } from '../../shared/errors/domain-error';
import { AppResult, err, ok } from '../../shared/result/result.types';

export interface Customer {
  readonly id: string;
  readonly fullName: string;
  readonly email: string;
  readonly phone: string;
}

export interface CustomerProps {
  id: string;
  fullName: string;
  email: string;
  phone: string;
}

// Deliberately simple format checks — full RFC 5322 email / E.164 phone
// validation is out of scope. `class-validator`'s `@IsEmail()` on the HTTP
// DTO (PR5) provides the user-facing validation; this is a domain-layer
// safety net shared by every construction path (DTO, DynamoDB read, tests).
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\+?\d{7,15}$/;

/**
 * Domain factory for `Customer`. Centralizes the invariants (required
 * fields, email/phone format) so every construction path — DynamoDB reads,
 * PR5's create-transaction upsert-by-email flow, and tests — shares the
 * same validation instead of re-implementing it.
 */
export const Customer = {
  create(props: CustomerProps): AppResult<Customer> {
    const requiredFields: Array<[string, string]> = [
      ['id', props.id],
      ['fullName', props.fullName],
      ['email', props.email],
      ['phone', props.phone],
    ];
    const missing = requiredFields.find(([, value]) => !value);
    if (missing) {
      return err(new ValidationError(`Customer is missing required field: ${missing[0]}`));
    }

    if (!EMAIL_REGEX.test(props.email)) {
      return err(new ValidationError(`Invalid customer email: ${props.email}`));
    }

    if (!PHONE_REGEX.test(props.phone)) {
      return err(new ValidationError(`Invalid customer phone: ${props.phone}`));
    }

    return ok({
      id: props.id,
      fullName: props.fullName,
      email: props.email,
      phone: props.phone,
    });
  },
};
