import { useState } from 'react';
import { act, render, screen } from '@testing-library/react';
import { useCountdown } from './useCountdown';

/** A trivial host so the hook can be rendered/re-rendered via RTL. */
function Host({ seconds, enabled, onDone }: { seconds: number; enabled: boolean; onDone: () => void }) {
  const { remaining, cancelled, cancel } = useCountdown(seconds, { enabled, onDone });
  return (
    <div>
      <span data-testid="remaining">{remaining}</span>
      <span data-testid="cancelled">{String(cancelled)}</span>
      <button type="button" onClick={cancel}>
        cancel
      </button>
    </div>
  );
}

/** Toggles `enabled` on demand, so tests can exercise re-arming after a prior run finished/was cancelled. */
function ToggleHost({ seconds, onDone }: { seconds: number; onDone: () => void }) {
  const [enabled, setEnabled] = useState(true);
  const { remaining, cancelled, cancel } = useCountdown(seconds, { enabled, onDone });
  return (
    <div>
      <span data-testid="remaining">{remaining}</span>
      <span data-testid="cancelled">{String(cancelled)}</span>
      <button type="button" onClick={cancel}>
        cancel
      </button>
      <button type="button" onClick={() => setEnabled(false)}>
        disable
      </button>
      <button type="button" onClick={() => setEnabled(true)}>
        enable
      </button>
    </div>
  );
}

/**
 * Advances the fake clock one second at a time (rather than one large jump)
 * so each tick's re-scheduled `setTimeout` is registered as its own
 * pre-existing timer before the next second is advanced — avoids relying on
 * a single `advanceTimersByTimeAsync` call to recursively discover timers
 * that get scheduled mid-flight.
 */
async function tickSeconds(times: number) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1000);
    });
  }
}

describe('useCountdown', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('starts at the initial seconds and ticks down by one every second while enabled', async () => {
    render(<Host seconds={10} enabled onDone={jest.fn()} />);

    expect(screen.getByTestId('remaining')).toHaveTextContent('10');

    await tickSeconds(1);
    expect(screen.getByTestId('remaining')).toHaveTextContent('9');

    await tickSeconds(2);
    expect(screen.getByTestId('remaining')).toHaveTextContent('7');
  });

  it('calls onDone exactly once when it reaches zero', async () => {
    const onDone = jest.fn();
    render(<Host seconds={3} enabled onDone={onDone} />);

    await tickSeconds(3);
    expect(screen.getByTestId('remaining')).toHaveTextContent('0');
    expect(onDone).toHaveBeenCalledTimes(1);

    // No further timer is scheduled once it reaches zero, so onDone never fires again.
    await tickSeconds(5);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('does not tick while disabled', async () => {
    render(<Host seconds={10} enabled={false} onDone={jest.fn()} />);

    await tickSeconds(5);
    expect(screen.getByTestId('remaining')).toHaveTextContent('10');
  });

  it('cancel() stops the countdown and never calls onDone, even once the original duration elapses', async () => {
    const onDone = jest.fn();
    render(<Host seconds={5} enabled onDone={onDone} />);

    await tickSeconds(2);
    expect(screen.getByTestId('remaining')).toHaveTextContent('3');

    act(() => {
      screen.getByRole('button', { name: 'cancel' }).click();
    });
    expect(screen.getByTestId('cancelled')).toHaveTextContent('true');

    await tickSeconds(10);
    expect(screen.getByTestId('remaining')).toHaveTextContent('3');
    expect(onDone).not.toHaveBeenCalled();
  });

  it('re-arms to the full duration when re-enabled after being disabled mid-countdown', async () => {
    const onDone = jest.fn();
    render(<ToggleHost seconds={4} onDone={onDone} />);

    await tickSeconds(2);
    expect(screen.getByTestId('remaining')).toHaveTextContent('2');

    act(() => {
      screen.getByRole('button', { name: 'disable' }).click();
    });
    await tickSeconds(5);
    expect(screen.getByTestId('remaining')).toHaveTextContent('2');

    act(() => {
      screen.getByRole('button', { name: 'enable' }).click();
    });
    expect(screen.getByTestId('remaining')).toHaveTextContent('4');
    expect(screen.getByTestId('cancelled')).toHaveTextContent('false');
  });

  it('clears its pending timer on unmount, never firing onDone afterwards', async () => {
    const onDone = jest.fn();
    const { unmount } = render(<Host seconds={2} enabled onDone={onDone} />);

    unmount();

    await tickSeconds(10);
    expect(onDone).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });
});
