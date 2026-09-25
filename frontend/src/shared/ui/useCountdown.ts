import { useEffect, useRef, useState } from 'react';

export interface UseCountdownOptions {
  /** The countdown only ticks while this is true; going false pauses it in place (no reset). */
  enabled: boolean;
  /** Called exactly once, when the countdown reaches zero while still enabled and not cancelled. */
  onDone: () => void;
}

export interface UseCountdownResult {
  /** Seconds remaining, counting down from the initial value passed to `useCountdown` to `0`. */
  remaining: number;
  /** True once `cancel()` has been called for the current run. */
  cancelled: boolean;
  /** Stops the countdown for good: no further ticking, and `onDone` will not fire, even if `enabled` stays true. */
  cancel: () => void;
}

/**
 * A small, self-contained countdown timer. Reschedules a single
 * `window.setTimeout` for the next tick (rather than a repeating
 * `setInterval`) — mirroring `ResultScreen`'s own processing-step ticker —
 * so it naturally stops scheduling once it reaches zero or once cancelled,
 * with no dangling timer either way. Re-arms to the full `seconds` value
 * whenever `enabled` transitions from false to true.
 */
export function useCountdown(seconds: number, { enabled, onDone }: UseCountdownOptions): UseCountdownResult {
  const [remaining, setRemaining] = useState(seconds);
  const [cancelled, setCancelled] = useState(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // Re-arms to a fresh run every time the countdown is (re)enabled. Bails
  // out as a no-op on a render where `enabled` is already true (deps
  // unchanged), so a parent re-rendering with the same `enabled=true` never
  // restarts an in-progress countdown.
  useEffect(() => {
    if (enabled) {
      setCancelled(false);
      setRemaining(seconds);
    }
  }, [enabled, seconds]);

  const isActive = enabled && !cancelled;

  useEffect(() => {
    if (!isActive || remaining === 0) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setRemaining((previous) => Math.max(previous - 1, 0));
    }, 1000);

    return () => window.clearTimeout(timeoutId);
  }, [isActive, remaining]);

  useEffect(() => {
    if (isActive && remaining === 0) {
      onDoneRef.current();
    }
  }, [isActive, remaining]);

  function cancel() {
    setCancelled(true);
  }

  return { remaining, cancelled, cancel };
}
