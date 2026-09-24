import {
  isFinalTransactionStatus,
  nextPollDelayMs,
  remainingPollBudgetMs,
  POLL_MAX_DELAY_MS,
  POLL_MAX_DURATION_MS,
} from './pollBackoff';

describe('nextPollDelayMs (linear backoff, 1s -> 5s cap)', () => {
  it('returns 1000ms for the 1st attempt', () => {
    expect(nextPollDelayMs(1)).toBe(1000);
  });

  it('grows linearly for the 2nd and 3rd attempts', () => {
    expect(nextPollDelayMs(2)).toBe(2000);
    expect(nextPollDelayMs(3)).toBe(3000);
  });

  it('caps at 5000ms from the 5th attempt onward', () => {
    expect(nextPollDelayMs(5)).toBe(POLL_MAX_DELAY_MS);
    expect(nextPollDelayMs(9)).toBe(POLL_MAX_DELAY_MS);
  });
});

describe('remainingPollBudgetMs (60s cap from pollStartedAt)', () => {
  it('returns the full budget when no time has elapsed', () => {
    expect(remainingPollBudgetMs(1_000, 1_000)).toBe(POLL_MAX_DURATION_MS);
  });

  it('subtracts elapsed time from the budget', () => {
    expect(remainingPollBudgetMs(0, 40_000)).toBe(POLL_MAX_DURATION_MS - 40_000);
  });

  it('never goes negative once the budget is exceeded', () => {
    expect(remainingPollBudgetMs(0, 90_000)).toBe(0);
  });
});

describe('isFinalTransactionStatus', () => {
  it('is true for APPROVED, DECLINED, VOIDED, ERROR', () => {
    expect(isFinalTransactionStatus('APPROVED')).toBe(true);
    expect(isFinalTransactionStatus('DECLINED')).toBe(true);
    expect(isFinalTransactionStatus('VOIDED')).toBe(true);
    expect(isFinalTransactionStatus('ERROR')).toBe(true);
  });

  it('is false for PENDING', () => {
    expect(isFinalTransactionStatus('PENDING')).toBe(false);
  });
});
