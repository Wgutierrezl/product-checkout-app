/**
 * Persists the optional-auth session (JWT + display fields) to
 * `sessionStorage` ONLY. This module is deliberately separate from
 * `persistMiddleware.ts` (which owns `localStorage` for checkout/
 * transaction) — the access token must never reach `localStorage`, and
 * `sessionStorage` naturally clears itself when the tab closes, which is
 * an acceptable (even desirable) session lifetime for a short-lived,
 * no-refresh JWT.
 */
export const AUTH_STORAGE_KEY = 'checkout-spa:auth:v1';

export interface PersistedAuthSession {
  token: string;
  userId: string;
  email: string;
  fullName: string;
}

// ---------------------------------------------------------------------------
// Safe storage access — mirrors persistMiddleware.ts's safeGet/Set/Remove:
// sessionStorage can throw (private-browsing restrictions, etc.), and none
// of that is ever allowed to crash the app.
// ---------------------------------------------------------------------------

function safeGetItem(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Private-mode restrictions, etc. — session persistence is a
    // best-effort convenience, never a hard requirement to keep working.
  }
}

function safeRemoveItem(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // See safeSetItem — never let a storage failure escape.
  }
}

function isPersistedAuthSession(value: unknown): value is PersistedAuthSession {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.token === 'string' &&
    typeof candidate.userId === 'string' &&
    typeof candidate.email === 'string' &&
    typeof candidate.fullName === 'string'
  );
}

/**
 * Reads and validates the persisted auth session on boot. Discards (and
 * wipes) it on any parse failure or shape mismatch — a partially-corrupted
 * session is not safe to reason about piecemeal, same policy as
 * `persistMiddleware.ts`'s `loadPersistedState`.
 */
export function loadAuthSession(): PersistedAuthSession | undefined {
  const raw = safeGetItem(AUTH_STORAGE_KEY);
  if (!raw) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    safeRemoveItem(AUTH_STORAGE_KEY);
    return undefined;
  }

  if (!isPersistedAuthSession(parsed)) {
    safeRemoveItem(AUTH_STORAGE_KEY);
    return undefined;
  }

  return parsed;
}

export function saveAuthSession(session: PersistedAuthSession): void {
  safeSetItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

export function clearAuthSession(): void {
  safeRemoveItem(AUTH_STORAGE_KEY);
}
