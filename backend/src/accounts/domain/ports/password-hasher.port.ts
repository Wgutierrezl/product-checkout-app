/**
 * Thin port around a one-way password hashing algorithm (bcryptjs in
 * production, see `bcrypt-password-hasher.adapter.ts`). Kept as plain
 * Promises rather than `AppResultAsync` — like `ClockPort`/`IdGeneratorPort`,
 * these are infrastructure primitives that don't produce domain-meaningful
 * failures for valid input.
 */
export interface PasswordHasherPort {
  hash(plainPassword: string): Promise<string>;
  compare(plainPassword: string, passwordHash: string): Promise<boolean>;
}

export const PASSWORD_HASHER_PORT = Symbol('PASSWORD_HASHER_PORT');
