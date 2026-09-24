import { Provider } from 'react-redux';
import { render, screen } from '@testing-library/react';
import { App } from './App';
import { createAppStore } from './store';
import { STORAGE_KEY } from '../shared/persistence/persistMiddleware';
import * as backendClient from '../api/backendClient';

jest.mock('../api/backendClient');

const mockedFetchProducts = backendClient.fetchProducts as jest.MockedFunction<typeof backendClient.fetchProducts>;
const mockedFetchPaymentAcceptance = backendClient.fetchPaymentAcceptance as jest.MockedFunction<
  typeof backendClient.fetchPaymentAcceptance
>;

/**
 * End-to-end refresh-resilience check: a REAL store built via
 * `createAppStore()` (not a hand-assembled test store), reading REAL
 * `localStorage`, wired into the REAL `App` component — exercising the
 * full persistMiddleware -> store -> App chain together, not just
 * persistMiddleware in isolation (see persistMiddleware.test.ts for the
 * unit-level SUMMARY->DETAILS downgrade coverage this complements).
 */
describe('App refresh resilience (integration)', () => {
  beforeEach(() => {
    localStorage.clear();
    mockedFetchProducts.mockReset();
    mockedFetchProducts.mockReturnValue(new Promise(() => {}));
    mockedFetchPaymentAcceptance.mockReset();
    mockedFetchPaymentAcceptance.mockReturnValue(new Promise(() => {}));
  });

  it('downgrades a persisted SUMMARY step to DETAILS on "refresh", showing the payment modal instead of the summary', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        checkout: {
          step: 'SUMMARY',
          productId: 'p1',
          quantity: 2,
          customer: { fullName: 'Jane Doe', email: 'jane@example.com', phone: '+573001234567' },
          delivery: { address: 'Cra 1 # 2-3', city: 'Bogota', region: 'Cundinamarca' },
          installments: 1,
          idempotencyKey: 'c4d5e6f7-a8b9-4c0d-8e1f-2a3b4c5d6e7f',
          cardSummary: { brand: 'visa', last4: '1111', holder: 'Jane Doe' },
        },
        transaction: { id: null, status: null, pollStartedAt: null },
      }),
    );

    // Simulates a page refresh: a NEW store instance is built (as main.tsx
    // does on boot), reading whatever was left in localStorage from before.
    const store = createAppStore();
    render(
      <Provider store={store}>
        <App />
      </Provider>,
    );

    expect(store.getState().checkout.step).toBe('DETAILS');
    expect(screen.getByRole('dialog', { name: 'Payment details' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Order summary' })).not.toBeInTheDocument();
  });

  it('the downgraded DETAILS form is prefilled from persisted customer/delivery, with card fields empty', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        checkout: {
          step: 'SUMMARY',
          productId: 'p1',
          quantity: 1,
          customer: { fullName: 'Jane Doe', email: 'jane@example.com', phone: '+573001234567' },
          delivery: { address: 'Cra 1 # 2-3', city: 'Bogota', region: 'Cundinamarca' },
          installments: 1,
          idempotencyKey: 'c4d5e6f7-a8b9-4c0d-8e1f-2a3b4c5d6e7f',
          cardSummary: { brand: 'visa', last4: '1111', holder: 'Jane Doe' },
        },
        transaction: { id: null, status: null, pollStartedAt: null },
      }),
    );

    const store = createAppStore();
    render(
      <Provider store={store}>
        <App />
      </Provider>,
    );

    expect(screen.getByLabelText(/full name/i)).toHaveValue('Jane Doe');
    expect(screen.getByLabelText(/^address/i)).toHaveValue('Cra 1 # 2-3');
    expect(screen.getByLabelText(/card number/i)).toHaveValue('');
    expect(screen.getByLabelText(/cvc/i)).toHaveValue('');
    expect(store.getState().checkout.cardToken).toBeNull();
    expect(store.getState().checkout.cardSummary).toBeNull();
  });
});
