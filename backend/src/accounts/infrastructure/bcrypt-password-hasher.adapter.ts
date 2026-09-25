import { Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';

import { PasswordHasherPort } from '../domain/ports/password-hasher.port';

/**
 * 10 rounds — the OWASP-recommended floor for bcrypt in 2024+, and an
 * acceptable cold-start cost on an ARM64 Lambda (see design's sign-off).
 */
export const BCRYPT_COST_FACTOR = 10;

@Injectable()
export class BcryptPasswordHasherAdapter implements PasswordHasherPort {
  hash(plainPassword: string): Promise<string> {
    return bcrypt.hash(plainPassword, BCRYPT_COST_FACTOR);
  }

  compare(plainPassword: string, passwordHash: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, passwordHash);
  }
}
