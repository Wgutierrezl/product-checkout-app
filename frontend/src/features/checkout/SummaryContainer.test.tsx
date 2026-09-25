import { StrictMode } from 'react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SummaryContainer } from './SummaryContainer';
import { checkoutReducer, initialCheckoutState, type CheckoutState } from './checkoutSlice';
import { catalogReducer, type CatalogState } from '../catalog/catalogSlice';
import { transactionReducer } from '../transaction/transactionSlice';
import * as backendClient from '../../api/backendClient';
import { BackendApiError, REQUEST_TIMEOUT_STATUS } from '../../api/types';
import type { Product } from '../../api/types';
import { buildTransactionFixture } from '../transaction/transactionFixtures';

jest.mock('../../api/backendClient');

const mockedFetchPaymentAcceptance = backendClient.fetchPaymentAcceptance as jest.MockedFunction<
  typeof backendClient.fetchPaymentAcceptance
>;
const mockedCreateTransaction = backendClient.createTransaction as jest.MockedFunction<
  typeof backendClient.createTransaction
>;
const mockedFetchProducts = backendClient.fetchProducts as jest.MockedFunction<typeof backendClient.fetchProducts>;
const mockedFetchTransaction = backendClient.fetchTransaction as jest.MockedFunction<
  typeof backendClient.fetchTransaction
>;

const PRODUCT: Product = {
  id: 'p1',
  name: 'Wireless Headphones',
  description: 'Noise-cancelling',
  price: 150_000,
  currency: 'COP',
  stock: 5,
  imageUrl: 'https://img.test/p1.png',
};

const CUSTOMER = { fullName: 'Jane Doe', email: 'jane@example.com', phone: '+573001234567' };
const DELIVERY = { address: 'Cra 1 # 2-3', city: 'Bogota', region: 'Cundinamarca' };
const CARD_SUMMARY = { brand: 'visa' as const, last4: '1111', holder: 'Jane Doe' };
const ACCEPTANCE = {
  acceptanceToken: 'tok_accept',
  acceptanceTokenPermalink: 'https://gateway.test/terms',
  acceptPersonalAuth: 'tok_auth',
  acceptPersonalAuthPermalink: 'https://gateway.test/auth',
};

function buildStore(checkoutOverrides: Partial<CheckoutState> = {}, catalogOverrides: Partial<CatalogState> = {}) {
  const checkout: CheckoutState = {
    ...initialCheckoutState,
    step: 'SUMMARY',
    productId: 'p1',
    quantity: 2,
    customer: CUSTOMER,
    delivery: DELIVERY,
    cardSummary: CARD_SUMMARY,
    cardToken: 'tok_test_card',
    installments: 1,
    ...checkoutOverrides,
  };
  const catalog: CatalogState = {
    items: [PRODUCT],
    status: 'succeeded',
    error: null,
    ...catalogOverrides,
  };

  return configureStore({
    reducer: { catalog: catalogReducer, checkout: checkoutReducer, transaction: transactionReducer },
    preloadedState: { checkout, catalog },
  });
}

function renderWithStore(store = buildStore()) {
  return { store, ...render(<Provider store={store}><SummaryContainer /></Provider>) };
}

async function acceptBoth(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('checkbox', { name: /terms/i }));
  await user.click(screen.getByRole('checkbox', { name: /personal data/i }));
}

describe('SummaryContainer', () => {
  beforeEach(() => {
    mockedFetchPaymentAcceptance.mockReset();
    mockedCreateTransaction.mockReset();
    mockedFetchProducts.mockReset();
    mockedFetchTransaction.mockReset();
    mockedFetchPaymentAcceptance.mockResolvedValue(ACCEPTANCE);
    mockedFetchProducts.mockResolvedValue([PRODUCT]);
  });

  it('fetches payment acceptance links on mount', async () => {
    renderWithStore();

    await waitFor(() => expect(mockedFetchPaymentAcceptance).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('link', { name: /terms/i })).toHaveAttribute('href', ACCEPTANCE.acceptanceTokenPermalink);
  });

  it('shows an acceptance-load error and disables Pay when the mount-time fetch fails', async () => {
    mockedFetchPaymentAcceptance.mockRejectedValueOnce(new BackendApiError('Payment provider unavailable', 502));
    renderWithStore();

    expect(await screen.findByText('Payment provider unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^pay$/i })).toBeDisabled();
  });

  it('resolves the selected product from the catalog for the summary display', async () => {
    renderWithStore();

    expect(await screen.findByText(PRODUCT.name)).toBeInTheDocument();
  });

  it('fetches a FRESH acceptance token again right before paying (never reuses the mount-time one)', async () => {
    mockedCreateTransaction.mockResolvedValue({
      id: 't1',
      reference: 'REF-1',
      status: 'PENDING',
      productAmount: 300_000,
      baseFee: 250_000,
      deliveryFee: 800_000,
      total: 1_350_000,
      currency: 'COP',
    });
    const user = userEvent.setup();
    renderWithStore();
    await acceptBoth(user);

    await user.click(screen.getByRole('button', { name: /^pay$/i }));

    await waitFor(() => expect(mockedFetchPaymentAcceptance).toHaveBeenCalledTimes(2));
  });

  it('submits the transaction with the in-memory cardToken and an ensured idempotencyKey', async () => {
    mockedCreateTransaction.mockResolvedValue({
      id: 't1',
      reference: 'REF-1',
      status: 'PENDING',
      productAmount: 300_000,
      baseFee: 250_000,
      deliveryFee: 800_000,
      total: 1_350_000,
      currency: 'COP',
    });
    const user = userEvent.setup();
    renderWithStore();
    await acceptBoth(user);

    await user.click(screen.getByRole('button', { name: /^pay$/i }));

    await waitFor(() => expect(mockedCreateTransaction).toHaveBeenCalledTimes(1));
    expect(mockedCreateTransaction).toHaveBeenCalledWith({
      idempotencyKey: expect.any(String),
      productId: 'p1',
      quantity: 2,
      customer: CUSTOMER,
      delivery: DELIVERY,
      cardToken: 'tok_test_card',
      installments: 1,
      acceptanceToken: ACCEPTANCE.acceptanceToken,
      acceptPersonalAuth: ACCEPTANCE.acceptPersonalAuth,
    });
  });

  it('on success: stores the transaction, moves to RESULT, clears the card token, and KEEPS the same idempotencyKey used in the request', async () => {
    mockedCreateTransaction.mockResolvedValue({
      id: 't1',
      reference: 'REF-1',
      status: 'PENDING',
      productAmount: 300_000,
      baseFee: 250_000,
      deliveryFee: 800_000,
      total: 1_350_000,
      currency: 'COP',
    });
    const user = userEvent.setup();
    const { store } = renderWithStore();
    await acceptBoth(user);

    await user.click(screen.getByRole('button', { name: /^pay$/i }));

    await waitFor(() => expect(store.getState().checkout.step).toBe('RESULT'));
    // A 201/PENDING response is not yet a "definitive outcome" (the transaction
    // may still settle to DECLINED/ERROR via polling) -- the key is rotated only
    // on a definite outcome (400, or an explicit "Try again" after a final
    // DECLINED/ERROR/VOIDED), never right after a successful submission.
    const sentKey = mockedCreateTransaction.mock.calls[0][0].idempotencyKey;
    const { checkout, transaction } = store.getState();
    expect(transaction.id).toBe('t1');
    expect(transaction.status).toBe('PENDING');
    expect(transaction.reference).toBe('REF-1');
    expect(checkout.cardToken).toBeNull();
    expect(checkout.idempotencyKey).toBe(sentKey);
    expect(checkout.submitAttempted).toBe(false);
  });

  it('does not stall Pay under React StrictMode double-invocation (dev mode)', async () => {
    mockedCreateTransaction.mockResolvedValue({
      id: 't1',
      reference: 'REF-1',
      status: 'PENDING',
      productAmount: 300_000,
      baseFee: 250_000,
      deliveryFee: 800_000,
      total: 1_350_000,
      currency: 'COP',
    });
    const user = userEvent.setup();
    const store = buildStore();

    render(
      <StrictMode>
        <Provider store={store}>
          <SummaryContainer />
        </Provider>
      </StrictMode>,
    );
    await acceptBoth(user);

    await user.click(screen.getByRole('button', { name: /^pay$/i }));

    await waitFor(() => expect(store.getState().checkout.step).toBe('RESULT'));
    expect(mockedCreateTransaction).toHaveBeenCalledTimes(1);
  });

  it('on success: records a pollStartedAt timestamp so the RESULT step can poll/resume', async () => {
    mockedCreateTransaction.mockResolvedValue({
      id: 't1',
      reference: 'REF-1',
      status: 'PENDING',
      productAmount: 300_000,
      baseFee: 250_000,
      deliveryFee: 800_000,
      total: 1_350_000,
      currency: 'COP',
    });
    const user = userEvent.setup();
    const { store } = renderWithStore();
    await acceptBoth(user);
    const before = Date.now();

    await user.click(screen.getByRole('button', { name: /^pay$/i }));

    await waitFor(() => expect(store.getState().checkout.step).toBe('RESULT'));
    const { pollStartedAt } = store.getState().transaction;
    expect(pollStartedAt).not.toBeNull();
    expect(pollStartedAt as number).toBeGreaterThanOrEqual(before);
  });

  it('disables Pay (double-submit guard) while a submission is in flight', async () => {
    mockedCreateTransaction.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    renderWithStore();
    await acceptBoth(user);

    await user.click(screen.getByRole('button', { name: /^pay$/i }));

    expect(await screen.findByRole('button', { name: /processing/i })).toBeDisabled();
  });

  it('marks submitAttempted true right before the request is sent, so a refresh mid-request can be resolved later', async () => {
    mockedCreateTransaction.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    const { store } = renderWithStore();
    await acceptBoth(user);

    await user.click(screen.getByRole('button', { name: /^pay$/i }));

    await waitFor(() => expect(store.getState().checkout.submitAttempted).toBe(true));
  });

  it('does not call createTransaction a second time when Pay is clicked again while submitting', async () => {
    mockedCreateTransaction.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    renderWithStore();
    await acceptBoth(user);

    await user.click(screen.getByRole('button', { name: /^pay$/i }));
    await user.click(screen.getByRole('button', { name: /processing/i }));

    expect(mockedCreateTransaction).toHaveBeenCalledTimes(1);
  });

  describe('error handling', () => {
    it('409 insufficient stock: shows the message, returns to PRODUCT, and refetches the catalog', async () => {
      mockedCreateTransaction.mockRejectedValue(new BackendApiError('Insufficient stock', 409));
      const user = userEvent.setup();
      const { store } = renderWithStore();
      await acceptBoth(user);

      await user.click(screen.getByRole('button', { name: /^pay$/i }));

      await waitFor(() => expect(store.getState().checkout.step).toBe('PRODUCT'));
      expect(store.getState().checkout.submitError).toBe('Insufficient stock');
      expect(mockedFetchProducts).toHaveBeenCalledTimes(1);
      expect(store.getState().checkout.submitAttempted).toBe(false);
      // A genuine first attempt rejected for stock is definite: no lookup.
      expect(mockedFetchTransaction).not.toHaveBeenCalled();
    });

    it('400 validation: shows the message and routes back to DETAILS to re-enter the card, rotating the key', async () => {
      mockedCreateTransaction.mockRejectedValue(new BackendApiError('Invalid installments', 400));
      const user = userEvent.setup();
      const existingKey = 'c4d5e6f7-a8b9-4c0d-8e1f-2a3b4c5d6e7f';
      const { store } = renderWithStore(buildStore({ idempotencyKey: existingKey }));
      await acceptBoth(user);

      await user.click(screen.getByRole('button', { name: /^pay$/i }));

      await waitFor(() => expect(store.getState().checkout.step).toBe('DETAILS'));
      const { checkout } = store.getState();
      expect(checkout.submitError).toBe('Invalid installments');
      expect(checkout.cardToken).toBeNull();
      expect(checkout.idempotencyKey).not.toBe(existingKey);
      expect(checkout.submitAttempted).toBe(false);
    });

    describe('client timeout (408): the POST may have landed, so look it up under the SAME key instead of asking for the card', () => {
      const existingKey = 'c4d5e6f7-a8b9-4c0d-8e1f-2a3b4c5d6e7f';

      it('the lookup finds it: shows the real status (APPROVED), with no second POST and the same key', async () => {
        mockedCreateTransaction.mockRejectedValue(new BackendApiError('Request timed out', REQUEST_TIMEOUT_STATUS));
        mockedFetchTransaction.mockResolvedValue(buildTransactionFixture({ id: existingKey, status: 'APPROVED' }));
        const user = userEvent.setup();
        const { store } = renderWithStore(buildStore({ idempotencyKey: existingKey }));
        await acceptBoth(user);

        await user.click(screen.getByRole('button', { name: /^pay$/i }));

        await waitFor(() => expect(store.getState().checkout.step).toBe('RESULT'));
        const { checkout, transaction } = store.getState();
        expect(mockedFetchTransaction).toHaveBeenCalledWith(existingKey);
        expect(mockedCreateTransaction).toHaveBeenCalledTimes(1);
        expect(transaction).toMatchObject({ id: existingKey, status: 'APPROVED' });
        expect(checkout.idempotencyKey).toBe(existingKey);
        expect(checkout.cardToken).toBeNull();
        expect(checkout.submitAttempted).toBe(false);
        expect(checkout.submitStatus).toBe('idle');
        expect(checkout.submitError).toBeNull();
      });

      it.each<[string, () => void]>([
        ['404: the POST never landed', () => mockedFetchTransaction.mockRejectedValue(new BackendApiError('Transaction not found', 404))],
        ['the lookup itself fails', () => mockedFetchTransaction.mockRejectedValue(new BackendApiError('Network error', 0))],
      ])('%s: falls back to DETAILS to re-enter the card, keeping the key and the in-flight marker', async (_name, arrangeLookup) => {
        mockedCreateTransaction.mockRejectedValue(new BackendApiError('Request timed out', REQUEST_TIMEOUT_STATUS));
        arrangeLookup();
        const user = userEvent.setup();
        const { store } = renderWithStore(buildStore({ idempotencyKey: existingKey }));
        await acceptBoth(user);

        await user.click(screen.getByRole('button', { name: /^pay$/i }));

        await waitFor(() => expect(store.getState().checkout.step).toBe('DETAILS'));
        const { checkout } = store.getState();
        expect(mockedFetchTransaction).toHaveBeenCalledWith(existingKey);
        expect(checkout.cardToken).toBeNull();
        expect(checkout.idempotencyKey).toBe(existingKey);
        expect(checkout.submitAttempted).toBe(true);
        expect(checkout.submitStatus).toBe('failed');
        expect(checkout.submitError).toBe(
          "We couldn't confirm your payment in time. Re-enter your card to check it again; you won't be charged twice.",
        );
      });
    });

    it('client timeout: dispatches nothing more if the summary unmounts while the lookup is pending', async () => {
      const existingKey = 'c4d5e6f7-a8b9-4c0d-8e1f-2a3b4c5d6e7f';
      mockedCreateTransaction.mockRejectedValue(new BackendApiError('Request timed out', REQUEST_TIMEOUT_STATUS));
      let rejectLookup: ((error: unknown) => void) | undefined;
      mockedFetchTransaction.mockReturnValue(
        new Promise((_resolve, reject) => {
          rejectLookup = reject;
        }),
      );
      const user = userEvent.setup();
      const { store, unmount } = renderWithStore(buildStore({ idempotencyKey: existingKey }));
      await acceptBoth(user);
      await user.click(screen.getByRole('button', { name: /^pay$/i }));
      await waitFor(() => expect(mockedFetchTransaction).toHaveBeenCalledWith(existingKey));

      unmount();
      rejectLookup?.(new BackendApiError('Transaction not found', 404));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(store.getState().checkout.step).toBe('SUMMARY');
      expect(store.getState().checkout.submitError).toBeNull();
      expect(store.getState().checkout.submitAttempted).toBe(true);
    });

    it('network (status 0): most likely never reached the backend -- keeps the SAME key and the SAME card token, stays on SUMMARY for a retry', async () => {
      mockedCreateTransaction.mockRejectedValue(new BackendApiError('Network error: Failed to fetch', 0));
      const user = userEvent.setup();
      const existingKey = 'c4d5e6f7-a8b9-4c0d-8e1f-2a3b4c5d6e7f';
      const { store } = renderWithStore(buildStore({ idempotencyKey: existingKey }));
      await acceptBoth(user);

      await user.click(screen.getByRole('button', { name: /^pay$/i }));

      await waitFor(() => expect(store.getState().checkout.submitStatus).toBe('failed'));
      const { checkout } = store.getState();
      expect(checkout.step).toBe('SUMMARY');
      expect(checkout.idempotencyKey).toBe(existingKey);
      expect(checkout.cardToken).toBe('tok_test_card');
      expect(checkout.submitAttempted).toBe(false);
    });

    it('5xx: the backend received the request -- treats the token as spent and routes to DETAILS to re-tokenize, but KEEPS the same key (safe idempotent replay on retry)', async () => {
      mockedCreateTransaction.mockRejectedValue(new BackendApiError('Payment provider unavailable', 502));
      const user = userEvent.setup();
      const existingKey = 'c4d5e6f7-a8b9-4c0d-8e1f-2a3b4c5d6e7f';
      const { store } = renderWithStore(buildStore({ idempotencyKey: existingKey }));
      await acceptBoth(user);

      await user.click(screen.getByRole('button', { name: /^pay$/i }));

      await waitFor(() => expect(store.getState().checkout.step).toBe('DETAILS'));
      const { checkout } = store.getState();
      expect(checkout.submitError).toBe('Payment provider unavailable');
      expect(checkout.cardToken).toBeNull();
      expect(checkout.idempotencyKey).toBe(existingKey);
      expect(checkout.submitAttempted).toBe(false);
    });

    it('502 from a gateway rejection (e.g. an expired token, or any other definite rejection): back to DETAILS with a neutral message, with a NEW key', async () => {
      mockedCreateTransaction.mockRejectedValue(
        new BackendApiError('Payment provider unavailable', 502, 'PaymentGatewayError'),
      );
      const user = userEvent.setup();
      const existingKey = 'c4d5e6f7-a8b9-4c0d-8e1f-2a3b4c5d6e7f';
      const { store } = renderWithStore(buildStore({ idempotencyKey: existingKey }));
      await acceptBoth(user);

      await user.click(screen.getByRole('button', { name: /^pay$/i }));

      await waitFor(() => expect(store.getState().checkout.step).toBe('DETAILS'));
      const { checkout } = store.getState();
      expect(checkout.submitError).toBe('The payment was rejected. Please re-enter your card or try another one.');
      expect(checkout.cardToken).toBeNull();
      // The backend already recorded that attempt as ERROR under the old
      // key; replaying it would only return that ERROR again.
      expect(checkout.idempotencyKey).not.toBe(existingKey);
      expect(checkout.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
      expect(checkout.submitAttempted).toBe(false);
      expect(checkout.submitStatus).toBe('failed');
    });

    it('502 without the gateway error type (e.g. from a proxy) keeps the generic 5xx handling and the same key', async () => {
      mockedCreateTransaction.mockRejectedValue(new BackendApiError('Bad Gateway', 502));
      const user = userEvent.setup();
      const existingKey = 'c4d5e6f7-a8b9-4c0d-8e1f-2a3b4c5d6e7f';
      const { store } = renderWithStore(buildStore({ idempotencyKey: existingKey }));
      await acceptBoth(user);

      await user.click(screen.getByRole('button', { name: /^pay$/i }));

      await waitFor(() => expect(store.getState().checkout.step).toBe('DETAILS'));
      expect(store.getState().checkout.submitError).toBe('Bad Gateway');
      expect(store.getState().checkout.idempotencyKey).toBe(existingKey);
    });

    it('falls back to a generic acceptance-fetch-before-pay error, staying on SUMMARY with the same key', async () => {
      mockedFetchPaymentAcceptance.mockResolvedValueOnce(ACCEPTANCE);
      mockedFetchPaymentAcceptance.mockRejectedValueOnce(new BackendApiError('Payment provider unavailable', 502));
      const user = userEvent.setup();
      const { store } = renderWithStore();
      await acceptBoth(user);

      await user.click(screen.getByRole('button', { name: /^pay$/i }));

      await waitFor(() => expect(store.getState().checkout.submitStatus).toBe('failed'));
      expect(store.getState().checkout.step).toBe('SUMMARY');
      expect(mockedCreateTransaction).not.toHaveBeenCalled();
    });
  });

  it('routes back to DETAILS with a message if critical checkout data is missing when paying', async () => {
    const user = userEvent.setup();
    const { store } = renderWithStore(buildStore({ customer: null }));
    await acceptBoth(user);

    await user.click(screen.getByRole('button', { name: /^pay$/i }));

    const { checkout } = store.getState();
    expect(checkout.step).toBe('DETAILS');
    expect(checkout.submitError).toBe('Missing checkout details. Please start again.');
    expect(mockedFetchPaymentAcceptance).toHaveBeenCalledTimes(1); // only the mount-time fetch, never the pre-pay one
  });

  it('falls back to a generic message when createTransaction rejects with a non-BackendApiError', async () => {
    mockedCreateTransaction.mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();
    const { store } = renderWithStore();
    await acceptBoth(user);

    await user.click(screen.getByRole('button', { name: /^pay$/i }));

    await waitFor(() => expect(store.getState().checkout.submitStatus).toBe('failed'));
    expect(store.getState().checkout.submitError).toBe('boom');
    expect(store.getState().checkout.submitAttempted).toBe(false);
  });

  it('ignores a pre-pay acceptance-fetch REJECTION that resolves after the container has unmounted', async () => {
    let rejectAcceptance: ((error: Error) => void) | undefined;
    mockedFetchPaymentAcceptance.mockResolvedValueOnce(ACCEPTANCE); // mount-time fetch
    mockedFetchPaymentAcceptance.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectAcceptance = reject;
        }),
    );
    const user = userEvent.setup();
    const { store, unmount } = renderWithStore();
    await acceptBoth(user);

    await user.click(screen.getByRole('button', { name: /^pay$/i }));
    unmount();
    rejectAcceptance?.(new Error('boom'));
    await Promise.resolve();
    await Promise.resolve();

    expect(store.getState().checkout.submitStatus).toBe('fetchingAcceptance');
  });

  it('ignores a successful pre-pay acceptance fetch that resolves after the container has unmounted', async () => {
    let resolveAcceptance: ((value: typeof ACCEPTANCE) => void) | undefined;
    mockedFetchPaymentAcceptance.mockResolvedValueOnce(ACCEPTANCE); // mount-time fetch
    mockedFetchPaymentAcceptance.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveAcceptance = resolve;
        }),
    );
    const user = userEvent.setup();
    const { store, unmount } = renderWithStore();
    await acceptBoth(user);

    await user.click(screen.getByRole('button', { name: /^pay$/i }));
    unmount();
    resolveAcceptance?.(ACCEPTANCE);
    await Promise.resolve();
    await Promise.resolve();

    expect(store.getState().checkout.submitStatus).toBe('fetchingAcceptance');
    expect(mockedCreateTransaction).not.toHaveBeenCalled();
  });

  it('ignores a createTransaction REJECTION that resolves after the container has unmounted', async () => {
    let rejectCreate: ((error: Error) => void) | undefined;
    mockedCreateTransaction.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectCreate = reject;
        }),
    );
    const user = userEvent.setup();
    const { store, unmount } = renderWithStore();
    await acceptBoth(user);

    await user.click(screen.getByRole('button', { name: /^pay$/i }));
    unmount();
    rejectCreate?.(new BackendApiError('Insufficient stock', 409));
    await Promise.resolve();
    await Promise.resolve();

    expect(store.getState().checkout.submitStatus).toBe('submitting');
    expect(store.getState().checkout.step).toBe('SUMMARY');
  });

  it('calls stepChangeRequested(DETAILS) when "Edit details" is clicked', async () => {
    const user = userEvent.setup();
    const { store } = renderWithStore();

    await user.click(await screen.findByRole('button', { name: /edit details/i }));

    expect(store.getState().checkout.step).toBe('DETAILS');
  });

  it('moves the step back to DETAILS when Escape is pressed', async () => {
    const user = userEvent.setup();
    const { store } = renderWithStore();
    await screen.findByRole('heading', { name: 'Order summary' });

    await user.keyboard('{Escape}');

    expect(store.getState().checkout.step).toBe('DETAILS');
  });

  it('ignores "Edit details" (click or Escape) while a submission is in flight, leaving the step unchanged', async () => {
    mockedCreateTransaction.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    const { store } = renderWithStore();
    await acceptBoth(user);
    await user.click(screen.getByRole('button', { name: /^pay$/i }));
    await screen.findByRole('button', { name: /processing/i });

    expect(screen.getByRole('button', { name: /edit details/i })).toBeDisabled();

    await user.keyboard('{Escape}');

    expect(store.getState().checkout.step).toBe('SUMMARY');
  });

  it('ignores a createTransaction result that resolves after the container has unmounted', async () => {
    let resolveCreate: ((value: Awaited<ReturnType<typeof backendClient.createTransaction>>) => void) | undefined;
    mockedCreateTransaction.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );
    const user = userEvent.setup();
    const { store, unmount } = renderWithStore();
    await acceptBoth(user);

    await user.click(screen.getByRole('button', { name: /^pay$/i }));
    unmount();
    resolveCreate?.({
      id: 't1',
      reference: 'REF-1',
      status: 'PENDING',
      productAmount: 300_000,
      baseFee: 250_000,
      deliveryFee: 800_000,
      total: 1_350_000,
      currency: 'COP',
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(store.getState().checkout.step).toBe('SUMMARY');
    expect(store.getState().transaction.id).toBeNull();
  });
});
