import { productSelected } from '../features/checkout/checkoutSlice';
import { STORAGE_KEY } from '../shared/persistence/persistMiddleware';
import { createAppStore } from './store';

describe('createAppStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts every slice at its own initial state when nothing is persisted', () => {
    const store = createAppStore();

    const state = store.getState();
    expect(state.catalog).toEqual({ items: [], status: 'idle', error: null });
    expect(state.checkout.step).toBe('PRODUCT');
    expect(state.checkout.cardToken).toBeNull();
    expect(state.transaction.id).toBeNull();
  });

  it('rehydrates persisted checkout/transaction fields, defaulting the rest (cardToken, submitStatus)', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        checkout: {
          step: 'DETAILS',
          productId: 'p1',
          quantity: 2,
          customer: null,
          delivery: null,
          installments: 1,
          idempotencyKey: 'c4d5e6f7-a8b9-4c0d-8e1f-2a3b4c5d6e7f',
          cardSummary: null,
        },
        transaction: { id: null, status: null, pollStartedAt: null },
      }),
    );

    const store = createAppStore();

    const state = store.getState();
    expect(state.checkout.step).toBe('DETAILS');
    expect(state.checkout.productId).toBe('p1');
    expect(state.checkout.idempotencyKey).toBe('c4d5e6f7-a8b9-4c0d-8e1f-2a3b4c5d6e7f');
    // Fields never persisted must fall back to slice defaults, not `undefined`.
    expect(state.checkout.cardToken).toBeNull();
    expect(state.checkout.submitStatus).toBe('idle');
    expect(state.checkout.submitError).toBeNull();
  });

  it('discards a version-mismatched persisted payload and starts fresh', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 999, checkout: {}, transaction: {} }));

    const store = createAppStore();

    expect(store.getState().checkout.step).toBe('PRODUCT');
  });

  it('wires persistMiddleware so a dispatched action is saved back to storage', () => {
    const store = createAppStore();

    store.dispatch(productSelected({ productId: 'p1', quantity: 1 }));

    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    expect(persisted.checkout.productId).toBe('p1');
  });
});
