/**
 * Normalizes an email address for storage and lookup: trims surrounding
 * whitespace and lowercases it. Applied once, canonically, by `User.create`
 * (so the stored `email` attribute and the `EMAIL#`-prefixed uniqueness
 * guard key — see `DynamoUserRepository.create` — always agree), and again
 * by any use case that queries `UserRepositoryPort.findByEmail` with a raw,
 * un-normalized caller-supplied email (`RegisterUseCase`'s duplicate check,
 * `LoginUseCase`'s lookup) — so "Foo@Bar.com" and "foo@bar.com" always
 * resolve to the exact same account, on both register and login.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
