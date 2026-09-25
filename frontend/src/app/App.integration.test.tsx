import { Provider } from 'react-redux';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { createAppStore } from './store';
import { CARD_SESSION_KEY, PERSISTED_VERSION, STORAGE_KEY } from '../shared/persistence/persistMiddleware';
import { BackendApiError } from '../api/types';
import * as backendClient from '../api/backendClient';

jest.mock('../api/backendClient');

const mockedFetchProducts = backendClient.fetchProducts as jest.MockedFunction<typeof backendClient.fetchProducts>;
const mockedFetchPaymentAcceptance = backendClient.fetchPaymentAcceptance as jest.MockedFunction<
  typeof backendClient.fetchPaymentAcceptance
>;
const mockedFetchTransaction = backendClient.fetchTransaction as jest.MockedFunction<
  typeof backendClient.fetchTransaction
>;
const mockedCreateTransaction = backendClient.createTransaction as jest.MockedFunction<
  typeof backendClient.createTransaction
>;

const PRODUCT = {
  id: 'p1',
  name: 'Wireless Headphones',
  description: 'Noise-cancelling',
  price: 150_000,
  currency: 'COP' as const,
  stock: 9,
  imageUrl: 'https://img.test/p1.png',
};
const ACCEPTANCE = {
  acceptanceToken: 'tok_accept',
  acceptanceTokenPermalink: 'https://example.test/terms.pdf',
  acceptPersonalAuth: 'tok_auth',
  acceptPersonalAuthPermalink: 'https://example.test/data.pdf',
};

/** What localStorage + sessionStorage hold right after reaching SUMMARY in a tab. */
function persistSummaryInThisTab() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: PERSISTED_VERSION,
      checkout: {
        step: 'SUMMARY',
        productId: 'p1',
        quantity: 2,
        customer: { fullName: 'Jane Doe', email: 'jane@example.com', phone: '+573001234567' },
        delivery: { address: 'Cra 1 # 2-3', city: 'Bogota', region: 'Cundinamarca' },
        installments: 1,
        idempotencyKey: 'c4d5e6f7-a8b9-4c0d-8e1f-2a3b4c5d6e7f',
        submitAttempted: false,
      },
      transaction: { id: null, status: null, pollStartedAt: null },
    }),
  );
  sessionStorage.setItem(
    CARD_SESSION_KEY,
    JSON.stringify({
      version: PERSISTED_VERSION,
      cardToken: 'tok_restored_card',
      cardSummary: { brand: 'visa', last4: '4242', holder: 'Jane Doe' },
    }),
  );
}

const IN_FLIGHT_KEY = 'c4d5e6f7-a8b9-4c0d-8e1f-2a3b4c5d6e7f';

function persistInFlightAttempt() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: PERSISTED_VERSION,
      checkout: {
        step: 'DETAILS',
        productId: 'p1',
        quantity: 1,
        customer: { fullName: 'Jane Doe', email: 'jane@example.com', phone: '+573001234567' },
        delivery: { address: 'Cra 1 # 2-3', city: 'Bogota', region: 'Cundinamarca' },
        installments: 1,
        idempotencyKey: IN_FLIGHT_KEY,
        submitAttempted: true,
      },
      transaction: { id: null, status: null, pollStartedAt: null },
    }),
  );
}

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
    sessionStorage.clear();
    mockedCreateTransaction.mockReset();
    mockedFetchProducts.mockReset();
    mockedFetchProducts.mockReturnValue(new Promise(() => {}));
    mockedFetchPaymentAcceptance.mockReset();
    mockedFetchPaymentAcceptance.mockReturnValue(new Promise(() => {}));
    mockedFetchTransaction.mockReset();
  });

  it('downgrades a persisted SUMMARY step to DETAILS on "refresh", showing the payment modal instead of the summary', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: PERSISTED_VERSION,
        checkout: {
          step: 'SUMMARY',
          productId: 'p1',
          quantity: 2,
          customer: { fullName: 'Jane Doe', email: 'jane@example.com', phone: '+573001234567' },
          delivery: { address: 'Cra 1 # 2-3', city: 'Bogota', region: 'Cundinamarca' },
          installments: 1,
          idempotencyKey: 'c4d5e6f7-a8b9-4c0d-8e1f-2a3b4c5d6e7f',
          submitAttempted: false,
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

  describe('a refresh on SUMMARY in the same tab (card session still in sessionStorage)', () => {
    it('stays on SUMMARY with the masked card, and both consent boxes render unchecked again', async () => {
      persistSummaryInThisTab();
      mockedFetchProducts.mockResolvedValue([PRODUCT]);
      mockedFetchPaymentAcceptance.mockResolvedValue(ACCEPTANCE);

      const store = createAppStore();
      render(
        <Provider store={store}>
          <App />
        </Provider>,
      );

      expect(store.getState().checkout.step).toBe('SUMMARY');
      const summary = screen.getByRole('region', { name: 'Order summary' });
      await waitFor(() => expect(summary).toHaveTextContent('•••• 4242'));
      expect(screen.queryByRole('dialog', { name: 'Payment details' })).not.toBeInTheDocument();
      const checkboxes = await screen.findAllByRole('checkbox');
      expect(checkboxes).toHaveLength(2);
      for (const checkbox of checkboxes) {
        expect(checkbox).not.toBeChecked();
      }
    });

    it('Pay fetches fresh acceptance tokens and spends the restored card token, then drops it from sessionStorage', async () => {
      persistSummaryInThisTab();
      mockedFetchProducts.mockResolvedValue([PRODUCT]);
      mockedFetchPaymentAcceptance.mockResolvedValue(ACCEPTANCE);
      mockedFetchTransaction.mockReturnValue(new Promise(() => {}));
      mockedCreateTransaction.mockResolvedValue({
        id: 'c4d5e6f7-a8b9-4c0d-8e1f-2a3b4c5d6e7f',
        reference: 'REF-1',
        status: 'PENDING',
        productAmount: 300_000,
        baseFee: 250_000,
        deliveryFee: 800_000,
        total: 1_350_000,
        currency: 'COP',
      });

      const store = createAppStore();
      render(
        <Provider store={store}>
          <App />
        </Provider>,
      );
      const user = userEvent.setup();
      const [terms, personalData] = await screen.findAllByRole('checkbox');
      await waitFor(() => expect(terms).toBeEnabled());
      const acceptanceCallsBeforePay = mockedFetchPaymentAcceptance.mock.calls.length;

      await user.click(terms);
      await user.click(personalData);
      await user.click(screen.getByRole('button', { name: /^pay/i }));

      await waitFor(() => expect(store.getState().checkout.step).toBe('RESULT'));
      expect(mockedFetchPaymentAcceptance.mock.calls.length).toBe(acceptanceCallsBeforePay + 1);
      expect(mockedCreateTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ cardToken: 'tok_restored_card', acceptanceToken: 'tok_accept' }),
      );
      expect(sessionStorage.getItem(CARD_SESSION_KEY)).toBeNull();
    });
  });

  it('the downgraded DETAILS form is prefilled from persisted customer/delivery, with card fields empty', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: PERSISTED_VERSION,
        checkout: {
          step: 'SUMMARY',
          productId: 'p1',
          quantity: 1,
          customer: { fullName: 'Jane Doe', email: 'jane@example.com', phone: '+573001234567' },
          delivery: { address: 'Cra 1 # 2-3', city: 'Bogota', region: 'Cundinamarca' },
          installments: 1,
          idempotencyKey: 'c4d5e6f7-a8b9-4c0d-8e1f-2a3b4c5d6e7f',
          submitAttempted: false,
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

  describe('resuming a payment attempt left in flight by a refresh (submitAttempted)', () => {
    it('200 (the request had reached the backend): forces RESULT for the discovered transaction, never rotating the key', async () => {
      persistInFlightAttempt();
      mockedFetchTransaction.mockResolvedValue({
        id: IN_FLIGHT_KEY,
        reference: 'REF-1',
        status: 'PENDING',
        productAmount: 300_000,
        baseFee: 250_000,
        deliveryFee: 800_000,
        total: 1_350_000,
        currency: 'COP',
      });

      const store = createAppStore();
      render(
        <Provider store={store}>
          <App />
        </Provider>,
      );

      await waitFor(() => expect(store.getState().checkout.step).toBe('RESULT'));
      expect(mockedFetchTransaction).toHaveBeenCalledWith(IN_FLIGHT_KEY);
      const { checkout, transaction } = store.getState();
      expect(transaction.id).toBe(IN_FLIGHT_KEY);
      expect(transaction.status).toBe('PENDING');
      expect(checkout.cardToken).toBeNull();
      expect(checkout.submitAttempted).toBe(false);
      expect(checkout.idempotencyKey).toBe(IN_FLIGHT_KEY);
    });

    it('404 (nothing was ever created): clears the in-flight flag and keeps the SAME key, staying on DETAILS', async () => {
      persistInFlightAttempt();
      mockedFetchTransaction.mockRejectedValue(new BackendApiError('Transaction not found', 404));

      const store = createAppStore();
      render(
        <Provider store={store}>
          <App />
        </Provider>,
      );

      await waitFor(() => expect(store.getState().checkout.submitAttempted).toBe(false));
      expect(store.getState().checkout.step).toBe('DETAILS');
      expect(store.getState().checkout.idempotencyKey).toBe(IN_FLIGHT_KEY);
      expect(store.getState().transaction.id).toBeNull();
    });
  });

  describe('"Back to store" from a final RESULT status', () => {
    it('resets checkout and transaction, clears persisted storage, and refetches the catalog with updated stock', async () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          version: PERSISTED_VERSION,
          checkout: {
            step: 'RESULT',
            productId: 'p1',
            quantity: 1,
            customer: { fullName: 'Jane Doe', email: 'jane@example.com', phone: '+573001234567' },
            delivery: { address: 'Cra 1 # 2-3', city: 'Bogota', region: 'Cundinamarca' },
            installments: 1,
            idempotencyKey: 'c4d5e6f7-a8b9-4c0d-8e1f-2a3b4c5d6e7f',
            submitAttempted: false,
          },
          transaction: { id: 't1', status: 'APPROVED', pollStartedAt: 123 },
        }),
      );
      const RESTOCKED_PRODUCT = {
        id: 'p1',
        name: 'Wireless Headphones',
        description: 'Noise-cancelling',
        price: 150_000,
        currency: 'COP' as const,
        stock: 9,
        imageUrl: 'https://img.test/p1.png',
      };
      mockedFetchProducts.mockReset();
      mockedFetchProducts.mockResolvedValueOnce([]).mockResolvedValueOnce([RESTOCKED_PRODUCT]);

      const store = createAppStore();
      render(
        <Provider store={store}>
          <App />
        </Provider>,
      );
      const user = userEvent.setup();
      await screen.findByRole('heading', { name: /approved/i });

      await user.click(screen.getByRole('button', { name: /back to store/i }));

      await waitFor(() => expect(store.getState().checkout.step).toBe('PRODUCT'));
      expect(store.getState().transaction.id).toBeNull();
      expect(store.getState().checkout.productId).toBeNull();
      // persistMiddleware re-persists on every subsequent action (including
      // fetchProducts' own pending/fulfilled actions dispatched right after
      // Back to store), so clearPersistedState() can't leave the STORAGE KEY
      // permanently absent -- what it guarantees is that whatever gets
      // re-persisted reflects the fully-reset (all-default) state, with no
      // stale checkout/transaction data surviving the reset.
      const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
      expect(persisted.checkout).toMatchObject({ step: 'PRODUCT', productId: null, customer: null, delivery: null });
      expect(persisted.transaction).toMatchObject({ id: null, status: null });
      expect(mockedFetchProducts).toHaveBeenCalledTimes(2);
      expect(await screen.findByText(RESTOCKED_PRODUCT.name)).toBeInTheDocument();
    });
  });
});
