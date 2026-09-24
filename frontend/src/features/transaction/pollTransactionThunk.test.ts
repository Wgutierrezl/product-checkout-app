import * as backendClient from '../../api/backendClient';
import { BackendApiError } from '../../api/types';
import { fetchAndDispatchTransaction, pollTransaction } from './pollTransactionThunk';
import { transactionErrorSet, transactionReceived } from './transactionSlice';
import { buildTransactionFixture } from './transactionFixtures';

jest.mock('../../api/backendClient');

const mockedFetchTransaction = backendClient.fetchTransaction as jest.MockedFunction<
  typeof backendClient.fetchTransaction
>;

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
    mockedFetchTransaction.mockResolvedValue(buildTransactionFixture({ status: 'APPROVED' }));
    const dispatch = jest.fn();

    const status = await fetchAndDispatchTransaction({ transactionId: 't1', dispatch });

    expect(status).toBe('APPROVED');
    expect(dispatch).toHaveBeenCalledWith(RECEIVED_PAYLOAD('APPROVED'));
  });

  it('forwards the signal to fetchTransaction, so a real network abort is possible', async () => {
    mockedFetchTransaction.mockResolvedValue(buildTransactionFixture());
    const controller = new AbortController();
    const dispatch = jest.fn();

    await fetchAndDispatchTransaction({ transactionId: 't1', dispatch, signal: controller.signal });

    expect(mockedFetchTransaction).toHaveBeenCalledWith('t1', { signal: controller.signal });
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

  it('skips dispatch entirely when the signal is already aborted by the time the response arrives', async () => {
    mockedFetchTransaction.mockResolvedValue(buildTransactionFixture({ status: 'APPROVED' }));
    const controller = new AbortController();
    controller.abort();
    const dispatch = jest.fn();

    await fetchAndDispatchTransaction({ transactionId: 't1', dispatch, signal: controller.signal });

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
    mockedFetchTransaction.mockResolvedValue(buildTransactionFixture({ status: 'APPROVED' }));
    const dispatch = jest.fn();

    await pollTransaction({
      transactionId: 't1',
      pollStartedAt: Date.now(),
      dispatch,
      signal: new AbortController().signal,
    });

    expect(mockedFetchTransaction).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(RECEIVED_PAYLOAD('APPROVED'));
  });

  it('retries on PENDING with a growing linear delay, stopping once a final status arrives', async () => {
    mockedFetchTransaction
      .mockResolvedValueOnce(buildTransactionFixture({ status: 'PENDING' }))
      .mockResolvedValueOnce(buildTransactionFixture({ status: 'PENDING' }))
      .mockResolvedValueOnce(buildTransactionFixture({ status: 'APPROVED' }));
    const dispatch = jest.fn();

    const promise = pollTransaction({
      transactionId: 't1',
      pollStartedAt: Date.now(),
      dispatch,
      signal: new AbortController().signal,
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
      .mockResolvedValueOnce(buildTransactionFixture({ status: 'APPROVED' }));
    const dispatch = jest.fn();

    const promise = pollTransaction({
      transactionId: 't1',
      pollStartedAt: Date.now(),
      dispatch,
      signal: new AbortController().signal,
    });
    await jest.advanceTimersByTimeAsync(0);
    expect(dispatch).toHaveBeenCalledWith(transactionErrorSet('Network error'));

    await jest.advanceTimersByTimeAsync(1_000);
    await promise;

    expect(mockedFetchTransaction).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenLastCalledWith(RECEIVED_PAYLOAD('APPROVED'));
  });

  it('stops scheduling further fetches once the 60s budget from pollStartedAt is exhausted', async () => {
    mockedFetchTransaction.mockResolvedValue(buildTransactionFixture({ status: 'PENDING' }));
    const dispatch = jest.fn();
    const pollStartedAt = Date.now();

    const promise = pollTransaction({
      transactionId: 't1',
      pollStartedAt,
      dispatch,
      signal: new AbortController().signal,
    });
    await jest.advanceTimersByTimeAsync(61_000);
    const callsAtCap = mockedFetchTransaction.mock.calls.length;
    expect(callsAtCap).toBeGreaterThan(1);

    await jest.advanceTimersByTimeAsync(10_000);
    await promise;

    expect(mockedFetchTransaction.mock.calls.length).toBe(callsAtCap);
  });

  it('performs exactly one fetch and does not schedule a retry when the budget is already exhausted at call time', async () => {
    mockedFetchTransaction.mockResolvedValue(buildTransactionFixture({ status: 'PENDING' }));
    const dispatch = jest.fn();

    await pollTransaction({
      transactionId: 't1',
      pollStartedAt: Date.now() - 90_000,
      dispatch,
      signal: new AbortController().signal,
    });

    expect(mockedFetchTransaction).toHaveBeenCalledTimes(1);
  });

  it('stops before a second fetch once the signal is aborted', async () => {
    mockedFetchTransaction.mockResolvedValue(buildTransactionFixture({ status: 'PENDING' }));
    const dispatch = jest.fn();
    const controller = new AbortController();

    const promise = pollTransaction({ transactionId: 't1', pollStartedAt: Date.now(), dispatch, signal: controller.signal });
    await jest.advanceTimersByTimeAsync(0);
    controller.abort();
    await jest.advanceTimersByTimeAsync(5_000);
    await promise;

    expect(mockedFetchTransaction).toHaveBeenCalledTimes(1);
  });

  it('aborting during the backoff wait resolves the loop IMMEDIATELY, without waiting for the full delay', async () => {
    mockedFetchTransaction
      .mockResolvedValueOnce(buildTransactionFixture({ status: 'PENDING' }))
      .mockResolvedValueOnce(buildTransactionFixture({ status: 'PENDING' }));
    const dispatch = jest.fn();
    const controller = new AbortController();

    const promise = pollTransaction({ transactionId: 't1', pollStartedAt: Date.now(), dispatch, signal: controller.signal });
    await jest.advanceTimersByTimeAsync(0); // 1st fetch resolves, now waiting out the 1000ms backoff
    controller.abort(); // abort DURING the wait, well before the 1000ms delay would naturally elapse

    await promise; // must resolve without needing `advanceTimersByTimeAsync(1000)`

    expect(mockedFetchTransaction).toHaveBeenCalledTimes(1);
  });

  it('discards a successful result that resolves AFTER the signal is aborted mid-flight, never dispatching or continuing the loop', async () => {
    let resolveFetch: ((value: ReturnType<typeof buildTransactionFixture>) => void) | undefined;
    mockedFetchTransaction.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const dispatch = jest.fn();
    const controller = new AbortController();

    const promise = pollTransaction({ transactionId: 't1', pollStartedAt: Date.now(), dispatch, signal: controller.signal });
    controller.abort();
    resolveFetch?.(buildTransactionFixture({ status: 'PENDING' }));
    await promise;

    expect(dispatch).not.toHaveBeenCalled();
    expect(mockedFetchTransaction).toHaveBeenCalledTimes(1);
  });

  it('discards a rejection that resolves AFTER the signal is aborted mid-flight, never dispatching an error', async () => {
    let rejectFetch: ((error: unknown) => void) | undefined;
    mockedFetchTransaction.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectFetch = reject;
        }),
    );
    const dispatch = jest.fn();
    const controller = new AbortController();

    const promise = pollTransaction({ transactionId: 't1', pollStartedAt: Date.now(), dispatch, signal: controller.signal });
    controller.abort();
    rejectFetch?.(new BackendApiError('Network error', 0));
    await promise;

    expect(dispatch).not.toHaveBeenCalled();
    expect(mockedFetchTransaction).toHaveBeenCalledTimes(1);
  });
});
