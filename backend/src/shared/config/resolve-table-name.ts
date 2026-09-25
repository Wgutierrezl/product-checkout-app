/**
 * Resolves a DynamoDB table name from an env var (set by `ApiStack` at
 * deploy time to the real table name from `DataStack`), falling back to the
 * literal default used for local/dev (DynamoDB Local, seeded by
 * `scripts/seed-products.ts`).
 *
 * Pure and trivially testable — kept separate from the repositories'
 * top-level `export const ..._TABLE_NAME = ...` so those single-expression
 * statements introduce no new branches to cover.
 */
export function resolveTableName(envValue: string | undefined, defaultName: string): string {
  return envValue ?? defaultName;
}
