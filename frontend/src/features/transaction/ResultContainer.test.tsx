import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResultContainer } from './ResultContainer';
import { initialTransactionState, transactionReducer, type TransactionState } from './transactionSlice';
import { checkoutReducer, initialCheckoutState, type CheckoutState } from '../checkout/checkoutSlice';
import { catalogReducer, type CatalogState } from '../catalog/catalogSlice';
import { STORAGE_KEY } from '../../shared/persistence/persistMiddleware';
import * as backendClient from '../../api/backendClient';
import type { Product } from '../../api/types';

jest.mock('../../api/backendClient');

const mockedFetchTransaction = backendClient.fetchTransaction as jest.MockedFunction<
  typeof backendClient.fetchTransaction
>;
const mockedFetchProducts = backendClient.fetchProducts as jest.MockedFunction<typeof backendClient.fetchProducts>;

const CUSTOMER = { fullName: 'Jane Doe', email: 'jane@example.com', phone: '+573001234567' };
const DELIVERY = { address: 'Cra 1 # 2-3', city: 'Bogota', region: 'Cundinamarca' };
const PRODUCT: Product = {
  id: 'p1',
  name: 'Wireless Headphones',
  description: 'Noise-cancelling',
  price: 150_000,
  currency: 'COP',
  stock: 5,
  imageUrl: 'https://img.test/p1.png',
};

function transaction(overrides: Partial<Awaited<ReturnType<typeof backendClient.fetchTransaction>>> = {}) {
  return {
    id: 't1',
    reference: 'REF-1',
    status: 'PENDING' as const,
    productAmount: 300_000,
    baseFee: 250_000,
    deliveryFee: 800_000,
    total: 1_350_000,
    currency: 'COP' as const,
    ...overrides,
  };
}

function buildStore(
  transactionOverrides: Partial<TransactionState> = {},
  checkoutOverrides: Partial<CheckoutState> = {},
  catalogOverrides: Partial<CatalogState> = {},
) {
  const transactionState: TransactionState = { ...initialTransactionState, ...transactionOverrides };
  const checkout: CheckoutState = {
    ...initialCheckoutState,
    step: 'RESULT',
    productId: 'p1',
    quantity: 1,
    customer: CUSTOMER,
    delivery: DELIVERY,
    idempotencyKey: 'c4d5e6f7-a8b9-4c0d-8e1f-2a3b4c5d6e7f',
    ...checkoutOverrides,
  };
  const catalog: CatalogState = { items: [], status: 'idle', error: null, ...catalogOverrides };

  return configureStore({
    reducer: { catalog: catalogReducer, checkout: checkoutReducer, transaction: transactionReducer },
    preloadedState: { transaction: transactionState, checkout, catalog },
  });
}

function renderWithStore(store = buildStore()) {
  return { store, ...render(<Provider store={store}><ResultContainer /></Provider>) };
}

describe('ResultContainer', () => {
  beforeEach(() => {
    mockedFetchTransaction.mockReset();
    mockedFetchProducts.mockReset();
    mockedFetchProducts.mockResolvedValue([PRODUCT]);
    localStorage.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows the PENDING spinner and starts polling, landing on APPROVED once the poll resolves', async () => {
    mockedFetchTransaction.mockResolvedValue(transaction({ status: 'APPROVED' }));
    const store = buildStore({ id: 't1', status: 'PENDING', pollStartedAt: null });

    renderWithStore(store);

    expect(screen.getByRole('status')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('heading', { name: /approved/i })).toBeInTheDocument());
    expect(mockedFetchTransaction).toHaveBeenCalledWith('t1');
  });

  it('sets pollStartedAt on mount when resuming without one (a freshly-created transaction)', async () => {
    mockedFetchTransaction.mockResolvedValue(transaction({ status: 'APPROVED' }));
    const before = Date.now();
    const store = buildStore({ id: 't1', status: 'PENDING', pollStartedAt: null });

    renderWithStore(store);

    await waitFor(() => expect(store.getState().transaction.status).toBe('APPROVED'));
    expect(store.getState().transaction.pollStartedAt).toBeGreaterThanOrEqual(before);
  });

  it('resumes from an EXISTING pollStartedAt (refresh scenario) instead of granting a fresh 60s budget', async () => {
    mockedFetchTransaction.mockResolvedValue(transaction({ status: 'PENDING' }));
    const oldPollStartedAt = Date.now() - 55_000; // only ~5s of budget left
    const store = buildStore({ id: 't1', status: 'PENDING', pollStartedAt: oldPollStartedAt });

    renderWithStore(store);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(6_000);
    });

    await waitFor(() => expect(screen.getByText(/still processing/i)).toBeInTheDocument());
    expect(store.getState().transaction.pollStartedAt).toBe(oldPollStartedAt);
  });

  it('does not poll at all when the resumed status is already final', () => {
    const store = buildStore({ id: 't1', status: 'DECLINED', pollStartedAt: Date.now() });

    renderWithStore(store);

    expect(mockedFetchTransaction).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: /not completed/i })).toBeInTheDocument();
  });

  it('shows "still processing" past the 60s cap, and a manual Check again re-fetches once', async () => {
    mockedFetchTransaction.mockResolvedValue(transaction({ status: 'PENDING' }));
    const store = buildStore({ id: 't1', status: 'PENDING', pollStartedAt: Date.now() });
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    renderWithStore(store);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(61_000);
    });
    await waitFor(() => expect(screen.getByText(/still processing/i)).toBeInTheDocument());
    const callsBeforeRetry = mockedFetchTransaction.mock.calls.length;

    await user.click(screen.getByRole('button', { name: /check again/i }));

    await waitFor(() => expect(mockedFetchTransaction.mock.calls.length).toBe(callsBeforeRetry + 1));
    await waitFor(() => expect(screen.getByText(/still processing/i)).toBeInTheDocument());
  });

  it('"Back to store" resets checkout and transaction, clears persisted storage, and refetches the catalog', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ some: 'stale-data' }));
    const store = buildStore({ id: 't1', status: 'APPROVED', reference: 'REF-1' });
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    renderWithStore(store);
    await user.click(screen.getByRole('button', { name: /back to store/i }));

    expect(store.getState().checkout.step).toBe('PRODUCT');
    expect(store.getState().transaction.id).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(mockedFetchProducts).toHaveBeenCalledTimes(1);
  });

  it('"Try again" after a DECLINED outcome returns to DETAILS, clears the transaction, and rotates the idempotencyKey', async () => {
    const existingKey = 'c4d5e6f7-a8b9-4c0d-8e1f-2a3b4c5d6e7f';
    const store = buildStore(
      { id: 't1', status: 'DECLINED', reference: 'REF-1' },
      { idempotencyKey: existingKey },
    );
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    renderWithStore(store);
    await user.click(screen.getByRole('button', { name: /try again/i }));

    const { checkout, transaction } = store.getState();
    expect(checkout.step).toBe('DETAILS');
    expect(checkout.idempotencyKey).not.toBe(existingKey);
    expect(checkout.customer).toEqual(CUSTOMER);
    expect(checkout.delivery).toEqual(DELIVERY);
    expect(transaction.id).toBeNull();
  });
});
