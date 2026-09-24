import * as backendClient from '../../api/backendClient';
import { BackendApiError } from '../../api/types';
import { fetchAndDispatchTransaction, pollTransaction } from './pollTransactionThunk';
import { transactionErrorSet, transactionReceived } from './transactionSlice';

jest.mock('../../api/backendClient');

const mockedFetchTransaction = backendClient.fetchTransaction as jest.MockedFunction<
  typeof backendClient.fetchTransaction
>;

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

const RECEIVED_PAYLOAD = (status: 'PENDING' | 'APPROVED') =>
  transactionReceived({
    id: 't1',
    status,
    reference: 'REF-1',
    amounts: { productAmount: 300_000, baseFee: 250_000, deliveryFee: 800_000, total: 1_350_000, currency: 'COP' },
  });

describe('fetchAndDispatchTransaction', () => {
  beforeEach(() => {
    mockedFetchTransaction.mockReset();
  });

  it('dispatches transactionReceived and returns the status on success', async () => {
    mockedFetchTransaction.mockResolvedValue(transaction({ status: 'APPROVED' }));
    const dispatch = jest.fn();

    const status = await fetchAndDispatchTransaction({ transactionId: 't1', dispatch });

    expect(status).toBe('APPROVED');
    expect(dispatch).toHaveBeenCalledWith(RECEIVED_PAYLOAD('APPROVED'));
  });

  it('dispatches transactionErrorSet and returns null on a backend error', async () => {
    mockedFetchTransaction.mockRejectedValue(new BackendApiError('Transaction not found', 404));
    const dispatch = jest.fn();

    const status = await fetchAndDispatchTransaction({ transactionId: 't1', dispatch });

    expect(status).toBeNull();
    expect(dispatch).toHaveBeenCalledWith(transactionErrorSet('Transaction not found'));
  });

  it('falls back to a generic message on a non-BackendApiError rejection', async () => {
    mockedFetchTransaction.mockRejectedValue(new Error('boom'));
    const dispatch = jest.fn();

    const status = await fetchAndDispatchTransaction({ transactionId: 't1', dispatch });

    expect(status).toBeNull();
    expect(dispatch).toHaveBeenCalledWith(transactionErrorSet('Could not check payment status.'));
  });

  it('skips dispatch entirely when isCancelled is already true by the time the response arrives', async () => {
    mockedFetchTransaction.mockResolvedValue(transaction({ status: 'APPROVED' }));
    const dispatch = jest.fn();

    await fetchAndDispatchTransaction({ transactionId: 't1', dispatch, isCancelled: () => true });

    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe('pollTransaction', () => {
  beforeEach(() => {
    mockedFetchTransaction.mockReset();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('stops after the first fetch when it already returns a final status', async () => {
    mockedFetchTransaction.mockResolvedValue(transaction({ status: 'APPROVED' }));
    const dispatch = jest.fn();

    await pollTransaction({ transactionId: 't1', pollStartedAt: Date.now(), dispatch, isCancelled: () => false });

    expect(mockedFetchTransaction).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(RECEIVED_PAYLOAD('APPROVED'));
  });

  it('retries on PENDING with a growing linear delay, stopping once a final status arrives', async () => {
    mockedFetchTransaction
      .mockResolvedValueOnce(transaction({ status: 'PENDING' }))
      .mockResolvedValueOnce(transaction({ status: 'PENDING' }))
      .mockResolvedValueOnce(transaction({ status: 'APPROVED' }));
    const dispatch = jest.fn();

    const promise = pollTransaction({
      transactionId: 't1',
      pollStartedAt: Date.now(),
      dispatch,
      isCancelled: () => false,
    });
    await jest.advanceTimersByTimeAsync(0);
    expect(mockedFetchTransaction).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(1_000);
    expect(mockedFetchTransaction).toHaveBeenCalledTimes(2);

    await jest.advanceTimersByTimeAsync(2_000);
    expect(mockedFetchTransaction).toHaveBeenCalledTimes(3);

    await promise;
    expect(dispatch).toHaveBeenLastCalledWith(RECEIVED_PAYLOAD('APPROVED'));
  });

  it('keeps retrying without aborting when a fetch rejects, until a later attempt succeeds', async () => {
    mockedFetchTransaction
      .mockRejectedValueOnce(new BackendApiError('Network error', 0))
      .mockResolvedValueOnce(transaction({ status: 'APPROVED' }));
    const dispatch = jest.fn();

    const promise = pollTransaction({
      transactionId: 't1',
      pollStartedAt: Date.now(),
      dispatch,
      isCancelled: () => false,
    });
    await jest.advanceTimersByTimeAsync(0);
    expect(dispatch).toHaveBeenCalledWith(transactionErrorSet('Network error'));

    await jest.advanceTimersByTimeAsync(1_000);
    await promise;

    expect(mockedFetchTransaction).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenLastCalledWith(RECEIVED_PAYLOAD('APPROVED'));
  });

  it('stops scheduling further fetches once the 60s budget from pollStartedAt is exhausted', async () => {
    mockedFetchTransaction.mockResolvedValue(transaction({ status: 'PENDING' }));
    const dispatch = jest.fn();
    const pollStartedAt = Date.now();

    const promise = pollTransaction({ transactionId: 't1', pollStartedAt, dispatch, isCancelled: () => false });
    await jest.advanceTimersByTimeAsync(61_000);
    const callsAtCap = mockedFetchTransaction.mock.calls.length;
    expect(callsAtCap).toBeGreaterThan(1);

    await jest.advanceTimersByTimeAsync(10_000);
    await promise;

    expect(mockedFetchTransaction.mock.calls.length).toBe(callsAtCap);
  });

  it('performs exactly one fetch and does not schedule a retry when the budget is already exhausted at call time', async () => {
    mockedFetchTransaction.mockResolvedValue(transaction({ status: 'PENDING' }));
    const dispatch = jest.fn();

    await pollTransaction({
      transactionId: 't1',
      pollStartedAt: Date.now() - 90_000,
      dispatch,
      isCancelled: () => false,
    });

    expect(mockedFetchTransaction).toHaveBeenCalledTimes(1);
  });

  it('stops before a second fetch once isCancelled becomes true', async () => {
    mockedFetchTransaction.mockResolvedValue(transaction({ status: 'PENDING' }));
    const dispatch = jest.fn();
    let cancelled = false;

    const promise = pollTransaction({
      transactionId: 't1',
      pollStartedAt: Date.now(),
      dispatch,
      isCancelled: () => cancelled,
    });
    await jest.advanceTimersByTimeAsync(0);
    cancelled = true;
    await jest.advanceTimersByTimeAsync(5_000);
    await promise;

    expect(mockedFetchTransaction).toHaveBeenCalledTimes(1);
  });

  it('discards a successful result that resolves AFTER isCancelled flips true mid-flight, never dispatching or continuing the loop', async () => {
    let resolveFetch: ((value: ReturnType<typeof transaction>) => void) | undefined;
    mockedFetchTransaction.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const dispatch = jest.fn();
    let cancelled = false;

    const promise = pollTransaction({
      transactionId: 't1',
      pollStartedAt: Date.now(),
      dispatch,
      isCancelled: () => cancelled,
    });
    cancelled = true;
    resolveFetch?.(transaction({ status: 'PENDING' }));
    await promise;

    expect(dispatch).not.toHaveBeenCalled();
    expect(mockedFetchTransaction).toHaveBeenCalledTimes(1);
  });

  it('discards a rejection that resolves AFTER isCancelled flips true mid-flight, never dispatching an error', async () => {
    let rejectFetch: ((error: unknown) => void) | undefined;
    mockedFetchTransaction.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectFetch = reject;
        }),
    );
    const dispatch = jest.fn();
    let cancelled = false;

    const promise = pollTransaction({
      transactionId: 't1',
      pollStartedAt: Date.now(),
      dispatch,
      isCancelled: () => cancelled,
    });
    cancelled = true;
    rejectFetch?.(new BackendApiError('Network error', 0));
    await promise;

    expect(dispatch).not.toHaveBeenCalled();
    expect(mockedFetchTransaction).toHaveBeenCalledTimes(1);
  });
});
