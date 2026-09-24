import * as backendClient from '../../api/backendClient';
import { BackendApiError } from '../../api/types';
import { resumeInFlightPayment } from './resumeInFlightPayment';
import { cardTokenConsumed, paymentAttemptResolved, stepForced } from './checkoutSlice';
import { pollStarted, transactionReceived } from '../transaction/transactionSlice';
import { buildTransactionFixture } from '../transaction/transactionFixtures';

jest.mock('../../api/backendClient');

const mockedFetchTransaction = backendClient.fetchTransaction as jest.MockedFunction<
  typeof backendClient.fetchTransaction
>;

const KEY = 'c4d5e6f7-a8b9-4c0d-8e1f-2a3b4c5d6e7f';

describe('resumeInFlightPayment', () => {
  beforeEach(() => {
    mockedFetchTransaction.mockReset();
  });

  it('on 200 (the request reached the backend): stores the transaction, starts a poll window, clears the token, resolves the attempt, and forces RESULT', async () => {
    mockedFetchTransaction.mockResolvedValue(buildTransactionFixture({ id: KEY, status: 'PENDING' }));
    const dispatch = jest.fn();
    const before = Date.now();

    await resumeInFlightPayment({ idempotencyKey: KEY, dispatch });

    expect(mockedFetchTransaction).toHaveBeenCalledWith(KEY);
    expect(dispatch).toHaveBeenCalledWith(
      transactionReceived({
        id: KEY,
        status: 'PENDING',
        reference: 'REF-1',
        amounts: { productAmount: 300_000, baseFee: 250_000, deliveryFee: 800_000, total: 1_350_000, currency: 'COP' },
      }),
    );
    const pollStartedCall = dispatch.mock.calls.find((call) => call[0].type === pollStarted.type);
    expect(pollStartedCall?.[0].payload).toBeGreaterThanOrEqual(before);
    expect(dispatch).toHaveBeenCalledWith(cardTokenConsumed());
    expect(dispatch).toHaveBeenCalledWith(paymentAttemptResolved());
    expect(dispatch).toHaveBeenCalledWith(stepForced('RESULT'));
  });

  it('on 200 with an already-final status: still resumes to RESULT (ResultContainer will not poll a final status)', async () => {
    mockedFetchTransaction.mockResolvedValue(buildTransactionFixture({ id: KEY, status: 'DECLINED' }));
    const dispatch = jest.fn();

    await resumeInFlightPayment({ idempotencyKey: KEY, dispatch });

    expect(dispatch).toHaveBeenCalledWith(stepForced('RESULT'));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: transactionReceived.type, payload: expect.objectContaining({ status: 'DECLINED' }) }),
    );
  });

  it('on 404 (nothing was ever created): resolves the attempt and does NOT touch the step or the idempotencyKey', async () => {
    mockedFetchTransaction.mockRejectedValue(new BackendApiError('Transaction not found', 404));
    const dispatch = jest.fn();

    await resumeInFlightPayment({ idempotencyKey: KEY, dispatch });

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(paymentAttemptResolved());
  });

  it('on an unrelated error (e.g. network/5xx): leaves submitAttempted untouched so a later check can retry', async () => {
    mockedFetchTransaction.mockRejectedValue(new BackendApiError('Network error', 0));
    const dispatch = jest.fn();

    await resumeInFlightPayment({ idempotencyKey: KEY, dispatch });

    expect(dispatch).not.toHaveBeenCalled();
  });
});
