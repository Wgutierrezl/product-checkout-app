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

/**
 * How long (in ms) until `resolveProcessingStepIndex` would return a
 * different value than it does right now — lets a caller schedule a single
 * timer for exactly that boundary instead of a 1s-interval that re-renders
 * dozens of times for only 2 real changes over the whole poll budget.
 * Returns `null` once already at the last step (nothing left to wait for).
 */
export function msUntilNextProcessingStep(
  elapsedMs: number,
  totalDurationMs: number = POLL_MAX_DURATION_MS,
): number | null {
  const stepCount = PROCESSING_STEPS.length;
  const stepDurationMs = totalDurationMs / stepCount;
  const currentIndex = resolveProcessingStepIndex(elapsedMs, totalDurationMs);

  if (currentIndex >= stepCount - 1) {
    return null;
  }

  const nextBoundaryMs = (currentIndex + 1) * stepDurationMs;
  return Math.max(0, nextBoundaryMs - Math.max(0, elapsedMs));
}
