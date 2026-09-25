import { configureStore } from '@reduxjs/toolkit';
import { catalogReducer } from '../../features/catalog/catalogSlice';
import {
  cardTokenConsumed,
  cardTokenized,
  checkoutReducer,
  checkoutReset,
  customerAndDeliverySet,
  paymentAttemptStarted,
  productSelected,
  stepChangeRequested,
  submitStatusSet,
} from '../../features/checkout/checkoutSlice';
import { pollStarted, transactionReceived, transactionReducer } from '../../features/transaction/transactionSlice';
import {
  CARD_SESSION_KEY,
  clearPersistedState,
  loadPersistedState,
  PERSISTED_VERSION,
  persistMiddleware,
  STORAGE_KEY,
} from './persistMiddleware';

const CUSTOMER = { fullName: 'Jane Doe', email: 'jane@example.com', phone: '+573001234567' };
const DELIVERY = { address: 'Cra 1 # 2-3', city: 'Bogota', region: 'Cundinamarca' };
const CARD_SUMMARY = { brand: 'visa' as const, last4: '1111', holder: 'Jane Doe' };
const AMOUNTS = { productAmount: 300_000, baseFee: 250_000, deliveryFee: 800_000, total: 1_350_000, currency: 'COP' as const };

function buildStore() {
  return configureStore({
    reducer: { catalog: catalogReducer, checkout: checkoutReducer, transaction: transactionReducer },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(persistMiddleware),
  });
}

function readPersisted(): Record<string, unknown> {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
}

function readCardSession(): Record<string, unknown> | null {
  const raw = sessionStorage.getItem(CARD_SESSION_KEY);
  return raw === null ? null : JSON.parse(raw);
}

/** Drives a store to SUMMARY with a tokenized card, the way the real Continue flow does. */
function reachSummary(store: ReturnType<typeof buildStore>) {
  store.dispatch(productSelected({ productId: 'p1', quantity: 1 }));
  store.dispatch(stepChangeRequested('DETAILS'));
  store.dispatch(customerAndDeliverySet({ customer: CUSTOMER, delivery: DELIVERY }));
  store.dispatch(cardTokenized({ cardToken: 'tok_test_card', cardSummary: CARD_SUMMARY }));
  store.dispatch(stepChangeRequested('SUMMARY'));
}

function validCardSession() {
  return { version: PERSISTED_VERSION, cardToken: 'tok_test_card', cardSummary: CARD_SUMMARY };
}

describe('persistMiddleware', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('persists whitelisted checkout and transaction fields after an action', () => {
    const store = buildStore();

    store.dispatch(productSelected({ productId: 'p1', quantity: 2 }));
    store.dispatch(customerAndDeliverySet({ customer: CUSTOMER, delivery: DELIVERY }));

    const persisted = readPersisted();
    expect(persisted).toMatchObject({
      version: PERSISTED_VERSION,
      checkout: expect.objectContaining({
        productId: 'p1',
        quantity: 2,
        customer: CUSTOMER,
        delivery: DELIVERY,
      }),
    });
  });

  it('persists submitAttempted (needed to resume an in-flight payment after a refresh)', () => {
    const store = buildStore();

    store.dispatch(paymentAttemptStarted());

    const persisted = readPersisted();
    expect(persisted.checkout).toMatchObject({ submitAttempted: true });
  });

  it('never writes cardToken, submitStatus, submitError, or the catalog slice to storage', () => {
    const store = buildStore();

    store.dispatch(productSelected({ productId: 'p1', quantity: 1 }));
    store.dispatch(cardTokenized({ cardToken: 'tok_test_card', cardSummary: CARD_SUMMARY }));
    store.dispatch(submitStatusSet('submitting'));

    const persisted = readPersisted();
    expect(persisted).not.toHaveProperty('catalog');
    expect(persisted.checkout).not.toHaveProperty('cardToken');
    expect(persisted.checkout).not.toHaveProperty('submitStatus');
    expect(persisted.checkout).not.toHaveProperty('submitError');
    expect(JSON.stringify(persisted)).not.toContain('tok_test_card');
  });

  it('keeps cardSummary and the card token out of localStorage entirely, even on SUMMARY', () => {
    const store = buildStore();

    reachSummary(store);

    const persisted = readPersisted();
    expect(persisted.checkout).not.toHaveProperty('cardSummary');
    expect(persisted.checkout).not.toHaveProperty('cardToken');
    expect(localStorage.getItem(STORAGE_KEY)).not.toContain('tok_test_card');
    expect(localStorage.getItem(STORAGE_KEY)).not.toContain(CARD_SUMMARY.last4);
  });

  describe('card session (sessionStorage)', () => {
    it('stores the card token and display summary in sessionStorage once on SUMMARY', () => {
      const store = buildStore();

      reachSummary(store);

      expect(readCardSession()).toEqual({
        version: PERSISTED_VERSION,
        cardToken: 'tok_test_card',
        cardSummary: CARD_SUMMARY,
      });
    });

    it('does not store the card session while still on DETAILS (the token is only kept for SUMMARY)', () => {
      const store = buildStore();
      store.dispatch(productSelected({ productId: 'p1', quantity: 1 }));
      store.dispatch(stepChangeRequested('DETAILS'));

      store.dispatch(cardTokenized({ cardToken: 'tok_test_card', cardSummary: CARD_SUMMARY }));

      expect(readCardSession()).toBeNull();
    });

    it.each<[string, (store: ReturnType<typeof buildStore>) => void]>([
      ['the token is consumed (payment submitted)', (store) => store.dispatch(cardTokenConsumed())],
      ['a payment attempt starts (the token is on its way to the gateway)', (store) => store.dispatch(paymentAttemptStarted())],
      ['the buyer goes back to edit details', (store) => store.dispatch(stepChangeRequested('DETAILS'))],
      ['the checkout resets', (store) => store.dispatch(checkoutReset())],
    ])('removes the card session from sessionStorage immediately when %s', (_name, act) => {
      const store = buildStore();
      reachSummary(store);

      act(store);

      expect(sessionStorage.getItem(CARD_SESSION_KEY)).toBeNull();
    });
  });

  it('persists whitelisted transaction fields, not amounts/error', () => {
    const store = buildStore();

    store.dispatch(transactionReceived({ id: 't1', status: 'PENDING', amounts: AMOUNTS, reference: 'ref-1' }));
    store.dispatch(pollStarted(123456));

    const persisted = readPersisted();
    expect(persisted.transaction).toEqual({ id: 't1', status: 'PENDING', pollStartedAt: 123456 });
  });

  describe('loadPersistedState', () => {
    it('returns undefined when nothing is stored', () => {
      expect(loadPersistedState()).toBeUndefined();
    });

    it('returns undefined and clears storage when the payload is malformed JSON', () => {
      localStorage.setItem(STORAGE_KEY, '{not json');

      expect(loadPersistedState()).toBeUndefined();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('returns undefined and clears storage when the payload is valid JSON but not an object', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(42));

      expect(loadPersistedState()).toBeUndefined();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('returns undefined and clears storage on a version mismatch', () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ version: 999, checkout: { step: 'DETAILS' }, transaction: {} }),
      );

      expect(loadPersistedState()).toBeUndefined();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('rehydrates a valid persisted state as-is when step is not SUMMARY', () => {
      const store = buildStore();
      store.dispatch(productSelected({ productId: 'p1', quantity: 1 }));
      store.dispatch(customerAndDeliverySet({ customer: CUSTOMER, delivery: DELIVERY }));
      store.dispatch(stepChangeRequested('DETAILS'));

      const rehydrated = loadPersistedState();

      expect(rehydrated?.checkout).toMatchObject({ step: 'DETAILS', customer: CUSTOMER, delivery: DELIVERY });
    });

    it('stays on SUMMARY with the token and summary when the tab still holds a valid card session', () => {
      const store = buildStore();
      reachSummary(store);

      const rehydrated = loadPersistedState();

      expect(rehydrated?.checkout).toMatchObject({
        step: 'SUMMARY',
        cardToken: 'tok_test_card',
        cardSummary: CARD_SUMMARY,
        customer: CUSTOMER,
        delivery: DELIVERY,
      });
    });

    it('leaves a valid card session in place after reading it, so a quick second refresh still resumes SUMMARY', () => {
      const store = buildStore();
      reachSummary(store);

      loadPersistedState();

      expect(readCardSession()).toEqual(validCardSession());
      expect(loadPersistedState()?.checkout.step).toBe('SUMMARY');
    });

    it('downgrades a persisted SUMMARY step to DETAILS when there is no card session (e.g. a new tab)', () => {
      const store = buildStore();
      reachSummary(store);
      sessionStorage.clear();

      const rehydrated = loadPersistedState();

      expect(rehydrated?.checkout).toMatchObject({
        step: 'DETAILS',
        cardToken: null,
        cardSummary: null,
        customer: CUSTOMER,
        delivery: DELIVERY,
      });
    });

    it('downgrades SUMMARY and discards the card session when a payment attempt was in flight (the token may be spent)', () => {
      const store = buildStore();
      reachSummary(store);
      sessionStorage.setItem(CARD_SESSION_KEY, JSON.stringify(validCardSession()));
      const persisted = readPersisted();
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...persisted, checkout: { ...(persisted.checkout as object), submitAttempted: true } }),
      );

      const rehydrated = loadPersistedState();

      expect(rehydrated?.checkout).toMatchObject({ step: 'DETAILS', cardToken: null, cardSummary: null });
      expect(sessionStorage.getItem(CARD_SESSION_KEY)).toBeNull();
    });

    it('discards a leftover card session when the persisted step is not SUMMARY', () => {
      const store = buildStore();
      store.dispatch(productSelected({ productId: 'p1', quantity: 1 }));
      store.dispatch(stepChangeRequested('DETAILS'));
      sessionStorage.setItem(CARD_SESSION_KEY, JSON.stringify(validCardSession()));

      const rehydrated = loadPersistedState();

      expect(rehydrated?.checkout).toMatchObject({ step: 'DETAILS', cardToken: null, cardSummary: null });
      expect(sessionStorage.getItem(CARD_SESSION_KEY)).toBeNull();
    });

    it('discards a leftover card session when nothing else is persisted', () => {
      sessionStorage.setItem(CARD_SESSION_KEY, JSON.stringify(validCardSession()));

      expect(loadPersistedState()).toBeUndefined();
      expect(sessionStorage.getItem(CARD_SESSION_KEY)).toBeNull();
    });

    it('only rehydrates whitelisted fields, ignoring anything else planted in localStorage', () => {
      const store = buildStore();
      store.dispatch(productSelected({ productId: 'p1', quantity: 1 }));
      store.dispatch(stepChangeRequested('DETAILS'));
      const persisted = readPersisted();
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          ...persisted,
          checkout: { ...(persisted.checkout as object), cardToken: 'tok_planted', submitStatus: 'submitting' },
          transaction: { ...(persisted.transaction as object), error: 'planted' },
        }),
      );

      const rehydrated = loadPersistedState();

      expect(rehydrated?.checkout.cardToken).toBeNull();
      expect(rehydrated?.checkout).not.toHaveProperty('submitStatus');
      expect(rehydrated?.transaction).not.toHaveProperty('error');
    });

    describe('corrupted card sessions downgrade SUMMARY to DETAILS and are wiped', () => {
      function persistSummaryStep() {
        const store = buildStore();
        reachSummary(store);
      }

      it.each<[string, string]>([
        ['it is malformed JSON', '{not json'],
        ['it is not an object', JSON.stringify(42)],
        ['its version does not match', JSON.stringify({ ...validCardSession(), version: 999 })],
        ['the token is missing', JSON.stringify({ ...validCardSession(), cardToken: undefined })],
        ['the token is not a string', JSON.stringify({ ...validCardSession(), cardToken: 42 })],
        ['the token is empty', JSON.stringify({ ...validCardSession(), cardToken: '' })],
        ['the token is all digits (PAN-shaped)', JSON.stringify({ ...validCardSession(), cardToken: '4242424242424242' })],
        ['the token has unexpected characters', JSON.stringify({ ...validCardSession(), cardToken: 'tok test<script>' })],
        ['the token is absurdly long', JSON.stringify({ ...validCardSession(), cardToken: `tok_${'a'.repeat(300)}` })],
        ['the summary is missing', JSON.stringify({ ...validCardSession(), cardSummary: null })],
        [
          'the summary brand is unknown',
          JSON.stringify({ ...validCardSession(), cardSummary: { ...CARD_SUMMARY, brand: 'amex' } }),
        ],
        [
          'the summary last4 is not exactly 4 digits',
          JSON.stringify({ ...validCardSession(), cardSummary: { ...CARD_SUMMARY, last4: '4242424242424242' } }),
        ],
        [
          'the summary holder is not a string',
          JSON.stringify({ ...validCardSession(), cardSummary: { ...CARD_SUMMARY, holder: 7 } }),
        ],
      ])('when %s', (_name, raw) => {
        persistSummaryStep();
        sessionStorage.setItem(CARD_SESSION_KEY, raw);

        const rehydrated = loadPersistedState();

        expect(rehydrated?.checkout).toMatchObject({ step: 'DETAILS', cardToken: null, cardSummary: null });
        expect(sessionStorage.getItem(CARD_SESSION_KEY)).toBeNull();
      });
    });
  });

  describe('clearPersistedState', () => {
    it('removes the storage key entirely', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: PERSISTED_VERSION, checkout: {}, transaction: {} }));

      clearPersistedState();

      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('also removes the card session from sessionStorage', () => {
      sessionStorage.setItem(CARD_SESSION_KEY, JSON.stringify(validCardSession()));

      clearPersistedState();

      expect(sessionStorage.getItem(CARD_SESSION_KEY)).toBeNull();
    });
  });

  describe('storage failures never crash the app', () => {
    let originalLocalStorage: Storage;
    let originalSessionStorage: Storage;

    beforeEach(() => {
      originalLocalStorage = window.localStorage;
      originalSessionStorage = window.sessionStorage;
    });

    afterEach(() => {
      Object.defineProperty(window, 'localStorage', { value: originalLocalStorage, configurable: true });
      Object.defineProperty(window, 'sessionStorage', { value: originalSessionStorage, configurable: true });
    });

    function throwingStorage(methods: {
      getItem?: () => string | null;
      setItem?: () => void;
      removeItem?: () => void;
    }): Storage {
      return {
        length: 0,
        clear: jest.fn(),
        key: jest.fn(),
        getItem: methods.getItem ?? (() => null),
        setItem: methods.setItem ?? (() => undefined),
        removeItem: methods.removeItem ?? (() => undefined),
      } as unknown as Storage;
    }

    it('does not throw when localStorage.setItem throws (e.g. quota exceeded)', () => {
      Object.defineProperty(window, 'localStorage', {
        value: throwingStorage({
          setItem: () => {
            throw new DOMException('Quota exceeded', 'QuotaExceededError');
          },
        }),
        configurable: true,
      });
      const store = buildStore();

      expect(() => store.dispatch(productSelected({ productId: 'p1', quantity: 1 }))).not.toThrow();
    });

    it('does not throw and returns undefined when localStorage.getItem throws (e.g. private mode)', () => {
      Object.defineProperty(window, 'localStorage', {
        value: throwingStorage({
          getItem: () => {
            throw new DOMException('Access denied', 'SecurityError');
          },
        }),
        configurable: true,
      });

      expect(() => loadPersistedState()).not.toThrow();
      expect(loadPersistedState()).toBeUndefined();
    });

    it('does not throw when localStorage.removeItem throws while discarding invalid state', () => {
      const stored: string | null = '{not json';
      Object.defineProperty(window, 'localStorage', {
        value: throwingStorage({
          getItem: () => stored,
          removeItem: () => {
            throw new DOMException('Access denied', 'SecurityError');
          },
        }),
        configurable: true,
      });

      expect(() => loadPersistedState()).not.toThrow();
    });

    it('does not throw when sessionStorage.setItem throws while saving the card session', () => {
      Object.defineProperty(window, 'sessionStorage', {
        value: throwingStorage({
          setItem: () => {
            throw new DOMException('Quota exceeded', 'QuotaExceededError');
          },
        }),
        configurable: true,
      });
      const store = buildStore();

      expect(() => reachSummary(store)).not.toThrow();
    });

    it('downgrades SUMMARY without throwing when sessionStorage cannot be read at all', () => {
      const store = buildStore();
      reachSummary(store);
      Object.defineProperty(window, 'sessionStorage', {
        get: () => {
          throw new DOMException('Access denied', 'SecurityError');
        },
        configurable: true,
      });

      expect(() => loadPersistedState()).not.toThrow();
      expect(loadPersistedState()?.checkout.step).toBe('DETAILS');
    });

    it('does not throw when clearPersistedState is called and removeItem throws', () => {
      Object.defineProperty(window, 'localStorage', {
        value: throwingStorage({
          removeItem: () => {
            throw new DOMException('Access denied', 'SecurityError');
          },
        }),
        configurable: true,
      });

      expect(() => clearPersistedState()).not.toThrow();
    });
  });

  describe('rehydrate field validation (corrupted same-version payloads)', () => {
    function validPayload() {
      return {
        version: PERSISTED_VERSION,
        checkout: {
          step: 'DETAILS',
          productId: 'p1',
          quantity: 2,
          customer: CUSTOMER,
          delivery: DELIVERY,
          installments: 3,
          idempotencyKey: 'c4d5e6f7-a8b9-4c0d-8e1f-2a3b4c5d6e7f',
          submitAttempted: false,
        },
        transaction: { id: 't1', status: 'PENDING', pollStartedAt: 123 },
      };
    }

    it('accepts a fully valid payload with nullable fields set to null', () => {
      const payload = validPayload();
      payload.checkout = {
        ...payload.checkout,
        customer: null as unknown as typeof CUSTOMER,
        delivery: null as unknown as typeof DELIVERY,
        idempotencyKey: null as unknown as string,
      };
      payload.transaction = {
        id: null as unknown as string,
        status: null as unknown as 'PENDING',
        pollStartedAt: null as unknown as number,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));

      expect(loadPersistedState()).toBeDefined();
    });

    it.each<[string, (p: ReturnType<typeof validPayload>) => unknown]>([
      ['step is not a valid CheckoutStep', (p) => ({ ...p, checkout: { ...p.checkout, step: 'BOGUS' } })],
      ['quantity is 0 (below minimum)', (p) => ({ ...p, checkout: { ...p.checkout, quantity: 0 } })],
      ['quantity is 11 (above maximum)', (p) => ({ ...p, checkout: { ...p.checkout, quantity: 11 } })],
      ['quantity is not an integer', (p) => ({ ...p, checkout: { ...p.checkout, quantity: 2.5 } })],
      [
        'customer.fullName is not a string',
        (p) => ({ ...p, checkout: { ...p.checkout, customer: { ...CUSTOMER, fullName: 123 } } }),
      ],
      [
        'delivery.region is missing',
        (p) => ({
          ...p,
          checkout: { ...p.checkout, delivery: { address: DELIVERY.address, city: DELIVERY.city } },
        }),
      ],
      ['installments is 0', (p) => ({ ...p, checkout: { ...p.checkout, installments: 0 } })],
      ['installments is 37 (above maximum)', (p) => ({ ...p, checkout: { ...p.checkout, installments: 37 } })],
      [
        'idempotencyKey is not uuid-ish',
        (p) => ({ ...p, checkout: { ...p.checkout, idempotencyKey: 'not-a-uuid' } }),
      ],
      ['transaction.id is not a string', (p) => ({ ...p, transaction: { ...p.transaction, id: 42 } })],
      [
        'transaction.status is not a known TransactionStatus',
        (p) => ({ ...p, transaction: { ...p.transaction, status: 'UNKNOWN_STATUS' } }),
      ],
      [
        'transaction.pollStartedAt is not a number',
        (p) => ({ ...p, transaction: { ...p.transaction, pollStartedAt: 'not-a-number' } }),
      ],
      ['checkout is missing entirely', (p) => ({ version: p.version, transaction: p.transaction })],
      ['customer is a non-object, non-null value', (p) => ({ ...p, checkout: { ...p.checkout, customer: 'oops' } })],
      ['delivery is a non-object, non-null value', (p) => ({ ...p, checkout: { ...p.checkout, delivery: 'oops' } })],
      [
        'delivery.postalCode is present but not a string',
        (p) => ({ ...p, checkout: { ...p.checkout, delivery: { ...DELIVERY, postalCode: 12345 } } }),
      ],
      [
        'submitAttempted is not a boolean',
        (p) => ({ ...p, checkout: { ...p.checkout, submitAttempted: 'oops' } }),
      ],
      ['transaction is a non-object, non-null value', (p) => ({ ...p, transaction: 'oops' })],
    ])('discards the persisted state and clears storage when %s', (_name, corrupt) => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(corrupt(validPayload())));

      expect(loadPersistedState()).toBeUndefined();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  });
});
