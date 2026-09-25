/**
 * `catalogSlice`'s rejected reducer always sets a non-null string (falling
 * back to its own generic message), so `error` should never actually be
 * `null` once `status === 'failed'` in practice. This defensive fallback
 * exists for type-safety and is unit-tested directly, since it's simpler
 * to verify in isolation than to force `catalog.error === null` through a
 * real dispatch flow (the container's mount effect immediately re-fetches
 * and would overwrite any preloaded state before an assertion could run).
 */
export function resolveErrorMessage(error: string | null): string {
  return error ?? 'Something went wrong loading products.';
}
