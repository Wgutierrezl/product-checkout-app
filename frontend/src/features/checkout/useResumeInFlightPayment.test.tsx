import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { render, waitFor } from '@testing-library/react';
import { useResumeInFlightPayment } from './useResumeInFlightPayment';
import { checkoutReducer, initialCheckoutState, paymentAttemptStarted, type CheckoutState } from './checkoutSlice';
import { catalogReducer } from '../catalog/catalogSlice';
import { transactionReducer } from '../transaction/transactionSlice';
import * as backendClient from '../../api/backendClient';
import { buildTransactionFixture } from '../transaction/transactionFixtures';

jest.mock('../../api/backendClient');

const mockedFetchTransaction = backendClient.fetchTransaction as jest.MockedFunction<
  typeof backendClient.fetchTransaction
>;

const KEY = 'c4d5e6f7-a8b9-4c0d-8e1f-2a3b4c5d6e7f';

function buildStore(checkoutOverrides: Partial<CheckoutState> = {}) {
  return configureStore({
    reducer: { catalog: catalogReducer, checkout: checkoutReducer, transaction: transactionReducer },
    preloadedState: { checkout: { ...initialCheckoutState, ...checkoutOverrides } },
  });
}

/** A trivial host so the hook (which needs a Provider) can be rendered via RTL. */
function Host() {
  useResumeInFlightPayment();
  return null;
}

describe('useResumeInFlightPayment', () => {
  beforeEach(() => {
    mockedFetchTransaction.mockReset();
  });

  it('resumes on mount when the persisted state already shows an in-flight attempt (post-refresh)', async () => {
    mockedFetchTransaction.mockResolvedValue(buildTransactionFixture({ id: KEY, status: 'PENDING' }));
    const store = buildStore({ submitAttempted: true, idempotencyKey: KEY });

    render(
      <Provider store={store}>
        <Host />
      </Provider>,
    );

    await waitFor(() => expect(mockedFetchTransaction).toHaveBeenCalledWith(KEY));
  });

  it('does NOT call fetchTransaction when submitAttempted transitions to true LIVE during this session', async () => {
    // Regression: a live Pay click (SummaryContainer.handlePay) dispatches
    // paymentAttemptStarted() BEFORE its own createTransaction POST
    // resolves. If this hook reacted to that live transition the same way
    // it reacts to a rehydrated-on-boot submitAttempted, its resume GET
    // would race the in-flight POST and could 404 against a transaction
    // that hasn't been persisted yet -- and worse, on a 404 it dispatches
    // paymentAttemptResolved(), prematurely clearing the very safety flag
    // a mid-POST refresh is supposed to rely on. This hook must only ever
    // resolve an attempt that was ALREADY in flight when it first mounted.
    const store = buildStore({ submitAttempted: false, idempotencyKey: KEY });

    render(
      <Provider store={store}>
        <Host />
      </Provider>,
    );

    // Mirrors SummaryContainer.handlePay: idempotencyKey is already ensured
    // (set above) BEFORE paymentAttemptStarted() flips submitAttempted true,
    // exactly like the live click that races the real POST /transactions.
    store.dispatch(paymentAttemptStarted());

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockedFetchTransaction).not.toHaveBeenCalled();
  });
});
