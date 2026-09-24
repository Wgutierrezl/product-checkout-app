import type { Middleware } from '@reduxjs/toolkit';
import type { CardSummary, CheckoutState } from '../../features/checkout/checkoutSlice';
import type { TransactionState } from '../../features/transaction/transactionSlice';

/** Bumped whenever the persisted shape changes; a mismatch discards it. */
export const PERSISTED_VERSION = 1;
export const STORAGE_KEY = 'checkout-spa:v1';

type PersistedCheckout = Pick<
  CheckoutState,
  'step' | 'productId' | 'quantity' | 'customer' | 'delivery' | 'installments' | 'idempotencyKey' | 'cardSummary'
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

function isPersistedState(value: unknown): value is PersistedState {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.version === 'number' &&
    typeof candidate.checkout === 'object' &&
    candidate.checkout !== null &&
    typeof candidate.transaction === 'object' &&
    candidate.transaction !== null
  );
}

/**
 * Reads and validates the persisted state on boot. Discards (and wipes) it
 * on any parse failure or version mismatch. A persisted `SUMMARY` step is
 * downgraded to `DETAILS` with `cardSummary` cleared — the in-memory
 * `cardToken` never survives a refresh, so the buyer must re-enter and
 * re-tokenize the card before returning to `SUMMARY` (see design Amendment:
 * tokenize at Continue).
 */
export function loadPersistedState():
  | { checkout: PersistedCheckout; transaction: PersistedTransaction }
  | undefined {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return undefined;
  }

  if (!isPersistedState(parsed) || parsed.version !== PERSISTED_VERSION) {
    localStorage.removeItem(STORAGE_KEY);
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
  localStorage.removeItem(STORAGE_KEY);
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
      },
      transaction: {
        id: state.transaction.id,
        status: state.transaction.status,
        pollStartedAt: state.transaction.pollStartedAt,
      },
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersist));

    return result;
  };
