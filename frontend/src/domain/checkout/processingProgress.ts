import { POLL_MAX_DURATION_MS } from './pollBackoff';

/** Shown, in order, on the RESULT screen while a transaction is PENDING. */
export const PROCESSING_STEPS = ['Payment sent', 'Confirming with your bank', 'Updating your order'] as const;

/**
 * Maps elapsed time since the poll started into which of `PROCESSING_STEPS`
 * is "current" — a rough, purely cosmetic progress indicator (the backend
 * has no notion of these 3 named steps) that divides the poll budget into
 * equal thirds. Clamped to `[0, PROCESSING_STEPS.length - 1]` so a negative
 * elapsed time (clock skew) or one past the budget never indexes out of
 * bounds.
 */
export function resolveProcessingStepIndex(elapsedMs: number, totalDurationMs: number = POLL_MAX_DURATION_MS): number {
  const stepCount = PROCESSING_STEPS.length;
  const boundedElapsed = Math.max(0, elapsedMs);
  const stepDurationMs = totalDurationMs / stepCount;
  const index = Math.floor(boundedElapsed / stepDurationMs);

  return Math.min(index, stepCount - 1);
}
