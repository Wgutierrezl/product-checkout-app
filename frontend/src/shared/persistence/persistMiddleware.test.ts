import { configureStore } from '@reduxjs/toolkit';
import { catalogReducer } from '../../features/catalog/catalogSlice';
import {
  cardTokenized,
  checkoutReducer,
  customerAndDeliverySet,
  paymentAttemptStarted,
  productSelected,
  stepChangeRequested,
  submitStatusSet,
} from '../../features/checkout/checkoutSlice';
import { pollStarted, transactionReceived, transactionReducer } from '../../features/transaction/transactionSlice';
import {
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

describe('persistMiddleware', () => {
  beforeEach(() => {
    localStorage.clear();
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

  it('persists cardSummary (safe display data) but not the raw card token', () => {
    const store = buildStore();

    store.dispatch(cardTokenized({ cardToken: 'tok_test_card', cardSummary: CARD_SUMMARY }));

    const persisted = readPersisted();
    expect(persisted.checkout).toMatchObject({ cardSummary: CARD_SUMMARY });
  });

  it('persists whitelisted transaction fields, not amounts/error', () => {
    const store = buildStore();

    store.dispatch(transactionReceived({ id: 't1', status: 'PENDING', amounts: AMOUNTS }));
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

    it('downgrades a persisted SUMMARY step to DETAILS and clears cardSummary', () => {
      const store = buildStore();
      store.dispatch(productSelected({ productId: 'p1', quantity: 1 }));
      store.dispatch(customerAndDeliverySet({ customer: CUSTOMER, delivery: DELIVERY }));
      store.dispatch(cardTokenized({ cardToken: 'tok_test_card', cardSummary: CARD_SUMMARY }));
      store.dispatch(stepChangeRequested('DETAILS'));
      store.dispatch(stepChangeRequested('SUMMARY'));

      const rehydrated = loadPersistedState();

      expect(rehydrated?.checkout).toMatchObject({
        step: 'DETAILS',
        cardSummary: null,
        customer: CUSTOMER,
        delivery: DELIVERY,
      });
    });
  });

  describe('clearPersistedState', () => {
    it('removes the storage key entirely', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: PERSISTED_VERSION, checkout: {}, transaction: {} }));

      clearPersistedState();

      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  });

  describe('storage failures never crash the app', () => {
    let originalLocalStorage: Storage;

    beforeEach(() => {
      originalLocalStorage = window.localStorage;
    });

    afterEach(() => {
      Object.defineProperty(window, 'localStorage', { value: originalLocalStorage, configurable: true });
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
          cardSummary: CARD_SUMMARY,
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
        cardSummary: null as unknown as typeof CARD_SUMMARY,
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
      [
        'cardSummary.brand is not a known brand',
        (p) => ({ ...p, checkout: { ...p.checkout, cardSummary: { ...CARD_SUMMARY, brand: 'amex' } } }),
      ],
      [
        'cardSummary.last4 is not a string',
        (p) => ({ ...p, checkout: { ...p.checkout, cardSummary: { ...CARD_SUMMARY, last4: 1111 } } }),
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
        'cardSummary is a non-object, non-null value',
        (p) => ({ ...p, checkout: { ...p.checkout, cardSummary: 'oops' } }),
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
