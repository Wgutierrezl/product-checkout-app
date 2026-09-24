import type { TransactionStatus } from '../../api/types';

/** First retry gap; each subsequent gap grows by this amount, up to `POLL_MAX_DELAY_MS`. */
export const POLL_INITIAL_DELAY_MS = 1_000;
/** Backoff never waits longer than this between two `GET /transactions/:id` calls. */
export const POLL_MAX_DELAY_MS = 5_000;
/** Total polling window, measured from `pollStartedAt` (survives a refresh). */
export const POLL_MAX_DURATION_MS = 60_000;

/**
 * Linear backoff (1s, 2s, 3s, 4s, 5s, 5s, ...): the gap before the Nth retry
 * (1-based) grows by `POLL_INITIAL_DELAY_MS` per attempt, capped at
 * `POLL_MAX_DELAY_MS`.
 */
export function nextPollDelayMs(attemptNumber: number): number {
  return Math.min(attemptNumber * POLL_INITIAL_DELAY_MS, POLL_MAX_DELAY_MS);
}

/** Milliseconds left in the 60s polling window; never negative. */
export function remainingPollBudgetMs(pollStartedAt: number, now: number): number {
  return Math.max(0, POLL_MAX_DURATION_MS - (now - pollStartedAt));
}

const FINAL_STATUSES: readonly TransactionStatus[] = ['APPROVED', 'DECLINED', 'VOIDED', 'ERROR'];

/** Whether polling should stop because the transaction reached a terminal state. */
export function isFinalTransactionStatus(status: TransactionStatus): boolean {
  return (FINAL_STATUSES as readonly string[]).includes(status);
}
