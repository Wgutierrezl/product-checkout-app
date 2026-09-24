import type { Middleware } from '@reduxjs/toolkit';
import type { CustomerInput, DeliveryInput, TransactionStatus } from '../../api/types';
import type { CardSummary, CheckoutState } from '../../features/checkout/checkoutSlice';
import type { TransactionState } from '../../features/transaction/transactionSlice';
import type { CheckoutStep } from '../../domain/checkout/stepMachine';

/** Bumped whenever the persisted shape changes; a mismatch discards it. */
export const PERSISTED_VERSION = 2;
export const STORAGE_KEY = 'checkout-spa:v1';

const CHECKOUT_STEPS: readonly CheckoutStep[] = ['PRODUCT', 'DETAILS', 'SUMMARY', 'RESULT'];
const TRANSACTION_STATUSES: readonly TransactionStatus[] = ['PENDING', 'APPROVED', 'DECLINED', 'VOIDED', 'ERROR'];
const CARD_BRANDS = ['visa', 'mastercard', 'unknown'] as const;
/**
 * Deliberately loose ("uuid-ish", per review): checks the 8-4-4-4-12 hex
 * group shape without pinning the version/variant nibbles, so it stays
 * forward-compatible if the UUID generation strategy ever changes.
 */
const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PersistedCheckout = Pick<
  CheckoutState,
  | 'step'
  | 'productId'
  | 'quantity'
  | 'customer'
  | 'delivery'
  | 'installments'
  | 'idempotencyKey'
  | 'cardSummary'
  | 'submitAttempted'
>;
type PersistedTransaction = Pick<TransactionState, 'id' | 'status' | 'pollStartedAt'>;

interface PersistedState {
  version: number;
  checkout: PersistedCheckout;
  transaction: PersistedTransaction;
}

/**
 * The slice of Redux state this middleware knows how to persist. Deliberately
 * NOT the app's full `RootState` — this module must not depend on
 * `app/store.ts` (that would create a circular import), and `catalog` is
 * never persisted (always refetched), so it has no place here at all.
 */
export interface PersistableState {
  checkout: CheckoutState;
  transaction: TransactionState;
}

// ---------------------------------------------------------------------------
// Safe storage access — `localStorage` can throw in the wild (quota exceeded
// in normal browsing, or any access at all denied in some private-browsing
// modes). None of that is ever allowed to crash the app; a storage failure
// just means "act as if nothing was persisted this time".
// ---------------------------------------------------------------------------

function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Quota exceeded, private-mode restrictions, etc. — persistence is a
    // best-effort convenience, never a hard requirement for the app to work.
  }
}

function safeRemoveItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // See safeSetItem — never let a storage failure escape.
  }
}

// ---------------------------------------------------------------------------
// Deep field validation — every field of a persisted payload is checked
// against its expected shape/range before being trusted. Any mismatch
// discards the ENTIRE persisted state (not just the offending field), since
// a partially-corrupted payload is not safe to reason about piecemeal.
// ---------------------------------------------------------------------------

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function isValidCustomer(value: unknown): value is CustomerInput | null {
  if (value === null) {
    return true;
  }
  if (typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.fullName === 'string' &&
    typeof candidate.email === 'string' &&
    typeof candidate.phone === 'string'
  );
}

function isValidDelivery(value: unknown): value is DeliveryInput | null {
  if (value === null) {
    return true;
  }
  if (typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.address === 'string' &&
    typeof candidate.city === 'string' &&
    typeof candidate.region === 'string' &&
    (candidate.postalCode === undefined || typeof candidate.postalCode === 'string')
  );
}

function isValidCardSummary(value: unknown): value is CardSummary | null {
  if (value === null) {
    return true;
  }
  if (typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.brand === 'string' &&
    (CARD_BRANDS as readonly string[]).includes(candidate.brand) &&
    typeof candidate.last4 === 'string' &&
    typeof candidate.holder === 'string'
  );
}

function isValidPersistedCheckout(value: unknown): value is PersistedCheckout {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.step === 'string' &&
    (CHECKOUT_STEPS as readonly string[]).includes(candidate.step) &&
    isNullableString(candidate.productId) &&
    isIntegerInRange(candidate.quantity, 1, 10) &&
    isValidCustomer(candidate.customer) &&
    isValidDelivery(candidate.delivery) &&
    isIntegerInRange(candidate.installments, 1, 36) &&
    isNullableString(candidate.idempotencyKey) &&
    (candidate.idempotencyKey === null || UUID_LIKE.test(candidate.idempotencyKey as string)) &&
    isValidCardSummary(candidate.cardSummary) &&
    typeof candidate.submitAttempted === 'boolean'
  );
}

function isValidPersistedTransaction(value: unknown): value is PersistedTransaction {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;

  return (
    isNullableString(candidate.id) &&
    (candidate.status === null ||
      (typeof candidate.status === 'string' && (TRANSACTION_STATUSES as readonly string[]).includes(candidate.status))) &&
    (candidate.pollStartedAt === null || typeof candidate.pollStartedAt === 'number')
  );
}

function isPersistedState(value: unknown): value is PersistedState {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.version === 'number' &&
    isValidPersistedCheckout(candidate.checkout) &&
    isValidPersistedTransaction(candidate.transaction)
  );
}

/**
 * Reads and validates the persisted state on boot. Discards (and wipes) it
 * on any parse failure, shape/range mismatch on ANY field, or version
 * mismatch. A persisted `SUMMARY` step is downgraded to `DETAILS` with
 * `cardSummary` cleared — the in-memory `cardToken` never survives a
 * refresh, so the buyer must re-enter and re-tokenize the card before
 * returning to `SUMMARY` (see design Amendment: tokenize at Continue).
 */
export function loadPersistedState():
  | { checkout: PersistedCheckout; transaction: PersistedTransaction }
  | undefined {
  const raw = safeGetItem(STORAGE_KEY);
  if (!raw) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    safeRemoveItem(STORAGE_KEY);
    return undefined;
  }

  if (!isPersistedState(parsed) || parsed.version !== PERSISTED_VERSION) {
    safeRemoveItem(STORAGE_KEY);
    return undefined;
  }

  let checkout = parsed.checkout;
  if (checkout.step === 'SUMMARY') {
    const downgradedCardSummary: CardSummary | null = null;
    checkout = { ...checkout, step: 'DETAILS', cardSummary: downgradedCardSummary };
  }

  return { checkout, transaction: parsed.transaction };
}

/** Wipes all persisted checkout/transaction state (final status + "Back to store", or explicit reset). */
export function clearPersistedState(): void {
  safeRemoveItem(STORAGE_KEY);
}

/**
 * Saves the whitelisted fields after every action. Anything not listed in
 * `PersistedCheckout`/`PersistedTransaction` above — `catalog` entirely,
 * `checkout.cardToken`/`submitStatus`/`submitError`, `transaction.amounts`/
 * `error` — is never written to `localStorage`.
 */
export const persistMiddleware: Middleware<Record<string, never>, PersistableState> =
  (store) => (next) => (action) => {
    const result = next(action);
    const state = store.getState();

    const toPersist: PersistedState = {
      version: PERSISTED_VERSION,
      checkout: {
        step: state.checkout.step,
        productId: state.checkout.productId,
        quantity: state.checkout.quantity,
        customer: state.checkout.customer,
        delivery: state.checkout.delivery,
        installments: state.checkout.installments,
        idempotencyKey: state.checkout.idempotencyKey,
        cardSummary: state.checkout.cardSummary,
        submitAttempted: state.checkout.submitAttempted,
      },
      transaction: {
        id: state.transaction.id,
        status: state.transaction.status,
        pollStartedAt: state.transaction.pollStartedAt,
      },
    };

    safeSetItem(STORAGE_KEY, JSON.stringify(toPersist));

    return result;
  };
