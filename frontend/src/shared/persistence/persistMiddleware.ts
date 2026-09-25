import type { Middleware } from '@reduxjs/toolkit';
import type { CustomerInput, DeliveryInput, TransactionStatus } from '../../api/types';
import type { CardSummary, CheckoutState, PaymentFormDraft } from '../../features/checkout/checkoutSlice';
import type { TransactionState } from '../../features/transaction/transactionSlice';
import type { CheckoutStep } from '../../domain/checkout/stepMachine';
import { findCountryByIso2 } from '../../domain/phone/countries';

/** Bumped whenever the persisted shape changes; a mismatch discards it. */
export const PERSISTED_VERSION = 4;
export const STORAGE_KEY = 'checkout-spa:v1';
/**
 * sessionStorage key for the single-use card token + its display summary.
 * sessionStorage (never localStorage) so a refresh on SUMMARY survives, but
 * closing the tab drops it for good. Card number, expiry and CVC are never
 * stored anywhere.
 */
export const CARD_SESSION_KEY = 'checkout-spa:card-session';

const CHECKOUT_STEPS: readonly CheckoutStep[] = ['PRODUCT', 'DETAILS', 'SUMMARY', 'RESULT'];
const TRANSACTION_STATUSES: readonly TransactionStatus[] = ['PENDING', 'APPROVED', 'DECLINED', 'VOIDED', 'ERROR'];
const CARD_BRANDS = ['visa', 'mastercard', 'unknown'] as const;
/**
 * Deliberately loose ("uuid-ish", per review): checks the 8-4-4-4-12 hex
 * group shape without pinning the version/variant nibbles, so it stays
 * forward-compatible if the UUID generation strategy ever changes.
 */
const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/**
 * An opaque gateway token: URL-safe characters with a sane length cap. It
 * must contain at least one non-digit, so a PAN-shaped value can never be
 * taken for (or smuggled in as) a token.
 */
const CARD_TOKEN_SHAPE = /^[A-Za-z0-9_-]{1,256}$/;
const ALL_DIGITS = /^\d+$/;
const LAST4_SHAPE = /^\d{4}$/;
/** E.164 caps a full number at 15 digits, so a national part never exceeds it. */
const PHONE_NATIONAL_SHAPE = /^\d{0,15}$/;
/** Generous cap for any free-text draft field; real input is far shorter. */
const MAX_DRAFT_TEXT_LENGTH = 500;
const DRAFT_TEXT_FIELDS = ['cardHolder', 'fullName', 'email', 'address', 'city', 'region', 'postalCode'] as const;

type PersistedCheckout = Pick<
  CheckoutState,
  | 'step'
  | 'productId'
  | 'quantity'
  | 'customer'
  | 'delivery'
  | 'installments'
  | 'idempotencyKey'
  | 'submitAttempted'
  | 'formDraft'
>;
type PersistedTransaction = Pick<TransactionState, 'id' | 'status' | 'pollStartedAt'>;
type RehydratedCheckout = PersistedCheckout & Pick<CheckoutState, 'cardToken' | 'cardSummary'>;

interface PersistedCardSession {
  version: number;
  cardToken: string;
  cardSummary: CardSummary;
}

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
// Safe storage access — Web Storage can throw in the wild (quota exceeded
// in normal browsing, or any access at all denied in some private-browsing
// modes, even just reading `window.sessionStorage`). None of that is ever
// allowed to crash the app; a storage failure just means "act as if nothing
// was persisted this time". The storage object itself is resolved INSIDE
// the try, since the property getter is what throws in some browsers.
// ---------------------------------------------------------------------------

type StorageArea = 'local' | 'session';

function storageFor(area: StorageArea): Storage {
  return area === 'local' ? window.localStorage : window.sessionStorage;
}

function safeGetItem(key: string, area: StorageArea = 'local'): string | null {
  try {
    return storageFor(area).getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string, area: StorageArea = 'local'): void {
  try {
    storageFor(area).setItem(key, value);
  } catch {
    // Quota exceeded, private-mode restrictions, etc. — persistence is a
    // best-effort convenience, never a hard requirement for the app to work.
  }
}

function safeRemoveItem(key: string, area: StorageArea = 'local'): void {
  try {
    storageFor(area).removeItem(key);
  } catch {
    // See safeSetItem — never let a storage failure escape.
  }
}

/** Parses JSON without throwing; `undefined` means "not parseable". */
function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
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

function isValidCardSummary(value: unknown): value is CardSummary {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.brand === 'string' &&
    (CARD_BRANDS as readonly string[]).includes(candidate.brand) &&
    typeof candidate.last4 === 'string' &&
    LAST4_SHAPE.test(candidate.last4) &&
    typeof candidate.holder === 'string'
  );
}

function isDraftText(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_DRAFT_TEXT_LENGTH;
}

function isValidFormDraft(value: unknown): value is PaymentFormDraft | null {
  if (value === null) {
    return true;
  }
  if (typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    DRAFT_TEXT_FIELDS.every((field) => isDraftText(candidate[field])) &&
    isIntegerInRange(candidate.installments, 1, 36) &&
    typeof candidate.phoneCountry === 'string' &&
    findCountryByIso2(candidate.phoneCountry) !== undefined &&
    typeof candidate.phoneNational === 'string' &&
    PHONE_NATIONAL_SHAPE.test(candidate.phoneNational)
  );
}

/** Rebuilds a draft from its known fields only, so nothing else stored alongside it survives. */
function pickFormDraft(draft: PaymentFormDraft | null): PaymentFormDraft | null {
  if (draft === null) {
    return null;
  }
  return {
    cardHolder: draft.cardHolder,
    installments: draft.installments,
    fullName: draft.fullName,
    email: draft.email,
    phoneCountry: draft.phoneCountry,
    phoneNational: draft.phoneNational,
    address: draft.address,
    city: draft.city,
    region: draft.region,
    postalCode: draft.postalCode,
  };
}

function isValidCardToken(value: unknown): value is string {
  return typeof value === 'string' && CARD_TOKEN_SHAPE.test(value) && !ALL_DIGITS.test(value);
}

function isValidCardSession(value: unknown): value is PersistedCardSession {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    candidate.version === PERSISTED_VERSION &&
    isValidCardToken(candidate.cardToken) &&
    isValidCardSummary(candidate.cardSummary)
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
    typeof candidate.submitAttempted === 'boolean' &&
    isValidFormDraft(candidate.formDraft)
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
 * Older payloads that differ from the current shape only by ADDITIONS are
 * upgraded instead of discarded, so a refresh right after a deploy never
 * loses a payment left in flight. v2 and v3 simply predate `formDraft`
 * (v2's extra `cardSummary` is ignored, since only whitelisted fields are
 * ever rebuilt). The result still goes through full validation.
 */
const MIGRATABLE_VERSIONS: readonly number[] = [2, 3];

function migrate(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  const candidate = value as Record<string, unknown>;
  if (!MIGRATABLE_VERSIONS.includes(candidate.version as number)) {
    return value;
  }
  if (typeof candidate.checkout !== 'object' || candidate.checkout === null) {
    return value;
  }
  return {
    ...candidate,
    version: PERSISTED_VERSION,
    checkout: { ...candidate.checkout, formDraft: null },
  };
}

/** Reads and validates the tab-scoped card session; `null` when absent or invalid. */
function readCardSession(): PersistedCardSession | null {
  const raw = safeGetItem(CARD_SESSION_KEY, 'session');
  if (!raw) {
    return null;
  }
  const parsed = safeParse(raw);
  return isValidCardSession(parsed) ? parsed : null;
}

/**
 * Reads and validates the persisted state on boot. Discards (and wipes) it
 * on any parse failure, shape/range mismatch on ANY field, or version
 * mismatch. Only whitelisted fields are ever returned, so anything else
 * planted in storage never reaches Redux.
 *
 * A persisted `SUMMARY` step stays on `SUMMARY` only when this tab still
 * holds a valid card session (sessionStorage) and no payment attempt was in
 * flight. Otherwise (new tab, closed tab, corrupted session, or a token that
 * may already have been sent) it is downgraded to `DETAILS` with no card
 * data, and the buyer re-enters the card (see design Amendment: tokenize at
 * Continue). A card session is never kept for any other step.
 */
export function loadPersistedState():
  | { checkout: RehydratedCheckout; transaction: PersistedTransaction }
  | undefined {
  const raw = safeGetItem(STORAGE_KEY);
  const parsed = raw ? migrate(safeParse(raw)) : undefined;
  if (!isPersistedState(parsed) || parsed.version !== PERSISTED_VERSION) {
    if (raw) {
      safeRemoveItem(STORAGE_KEY);
    }
    safeRemoveItem(CARD_SESSION_KEY, 'session');
    return undefined;
  }

  const persisted = parsed.checkout;
  const cardSession = persisted.step === 'SUMMARY' && !persisted.submitAttempted ? readCardSession() : null;
  const canResumeSummary = cardSession !== null;
  if (!canResumeSummary) {
    // Unused, invalid, or possibly already sent: never keep it around.
    safeRemoveItem(CARD_SESSION_KEY, 'session');
  }

  const checkout: RehydratedCheckout = {
    step: persisted.step === 'SUMMARY' && !canResumeSummary ? 'DETAILS' : persisted.step,
    productId: persisted.productId,
    quantity: persisted.quantity,
    customer: persisted.customer,
    delivery: persisted.delivery,
    installments: persisted.installments,
    idempotencyKey: persisted.idempotencyKey,
    submitAttempted: persisted.submitAttempted,
    formDraft: pickFormDraft(persisted.formDraft),
    cardToken: canResumeSummary ? cardSession.cardToken : null,
    cardSummary: canResumeSummary ? cardSession.cardSummary : null,
  };
  const transaction: PersistedTransaction = {
    id: parsed.transaction.id,
    status: parsed.transaction.status,
    pollStartedAt: parsed.transaction.pollStartedAt,
  };

  return { checkout, transaction };
}

/** Wipes all persisted checkout/transaction state (final status + "Back to store", or explicit reset). */
export function clearPersistedState(): void {
  safeRemoveItem(STORAGE_KEY);
  safeRemoveItem(CARD_SESSION_KEY, 'session');
}

/**
 * The card session is written ONLY while the buyer sits on SUMMARY with an
 * unspent token and no payment attempt in flight. Every other state removes
 * it at once: the token was consumed or is on its way to the gateway
 * (single-use), the buyer went back to edit details, or the checkout reset.
 */
function syncCardSession(checkout: CheckoutState): void {
  const { step, cardToken, cardSummary, submitAttempted } = checkout;
  if (step === 'SUMMARY' && cardToken && cardSummary && !submitAttempted) {
    const session: PersistedCardSession = { version: PERSISTED_VERSION, cardToken, cardSummary };
    safeSetItem(CARD_SESSION_KEY, JSON.stringify(session), 'session');
    return;
  }
  safeRemoveItem(CARD_SESSION_KEY, 'session');
}

/**
 * Saves the whitelisted fields after every action. Anything not listed in
 * `PersistedCheckout`/`PersistedTransaction` above — `catalog` entirely,
 * `checkout.cardToken`/`cardSummary`/`submitStatus`/`submitError`,
 * `transaction.amounts`/`error` — is never written to `localStorage`. The
 * card token and its display summary go to sessionStorage only, and only
 * while on SUMMARY (see `syncCardSession`).
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
        submitAttempted: state.checkout.submitAttempted,
        formDraft: pickFormDraft(state.checkout.formDraft),
      },
      transaction: {
        id: state.transaction.id,
        status: state.transaction.status,
        pollStartedAt: state.transaction.pollStartedAt,
      },
    };

    safeSetItem(STORAGE_KEY, JSON.stringify(toPersist));
    syncCardSession(state.checkout);

    return result;
  };
