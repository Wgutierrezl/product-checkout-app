import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResultScreen } from './ResultScreen';
import { formatCOP } from '../../domain/money/formatCOP';
import type { DeliveryInput } from '../../api/types';
import type { TransactionAmounts } from './transactionSlice';

const DELIVERY: DeliveryInput = { address: 'Cra 1 # 2-3', city: 'Bogota', region: 'Cundinamarca' };
const AMOUNTS: TransactionAmounts = {
  productAmount: 300_000,
  baseFee: 250_000,
  deliveryFee: 800_000,
  total: 1_350_000,
  currency: 'COP',
};

function renderResult(overrides: Partial<React.ComponentProps<typeof ResultScreen>> = {}) {
  const onCheckAgain = jest.fn();
  const onTryAgain = jest.fn();
  const onBackToStore = jest.fn();
  const utils = render(
    <ResultScreen
      status="PENDING"
      reference={null}
      amounts={null}
      delivery={DELIVERY}
      pollExhausted={false}
      pollStartedAt={null}
      onCheckAgain={onCheckAgain}
      onTryAgain={onTryAgain}
      onBackToStore={onBackToStore}
      {...overrides}
    />,
  );
  return { ...utils, onCheckAgain, onTryAgain, onBackToStore };
}

describe('ResultScreen', () => {
  describe('PENDING', () => {
    beforeEach(() => {
      jest.useFakeTimers({ now: new Date(2026, 0, 1) });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('shows a loading spinner announced via role=status while polling', () => {
      renderResult({ status: 'PENDING', pollExhausted: false });

      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /check again/i })).not.toBeInTheDocument();
    });

    it('shows a "still processing" message with a manual Check again button once the poll budget is exhausted', async () => {
      const { onCheckAgain } = renderResult({ status: 'PENDING', pollExhausted: true });

      expect(screen.getByText(/still processing/i)).toBeInTheDocument();
      const button = screen.getByRole('button', { name: /check again/i });
      button.click();
      expect(onCheckAgain).toHaveBeenCalledTimes(1);
    });

    it('announces "still processing" politely via aria-live (announced once when it appears, not spammed every poll)', () => {
      renderResult({ status: 'PENDING', pollExhausted: true });

      const message = screen.getByText(/still processing/i);
      expect(message).toHaveAttribute('aria-live', 'polite');
    });

    it('shows a "Processing your payment" title and a 3-step progress list, starting at step 1', () => {
      renderResult({ status: 'PENDING', pollExhausted: false, pollStartedAt: Date.now() });

      expect(screen.getByRole('heading', { name: /processing your payment/i })).toBeInTheDocument();
      const steps = screen.getAllByRole('listitem');
      expect(steps.map((step) => step.textContent)).toEqual([
        'Payment sent',
        'Confirming with your bank',
        'Updating your order',
      ]);
      expect(steps[0]).toHaveAttribute('aria-current', 'step');
    });

    it('advances the current progress step as time passes', () => {
      renderResult({ status: 'PENDING', pollExhausted: false, pollStartedAt: Date.now() });

      act(() => {
        jest.advanceTimersByTime(21_000);
      });

      const steps = screen.getAllByRole('listitem');
      expect(steps[1]).toHaveAttribute('aria-current', 'step');
    });

    it('shows the reference and amounts breakdown while still PENDING, if already available', () => {
      renderResult({
        status: 'PENDING',
        pollExhausted: false,
        pollStartedAt: Date.now(),
        reference: 'REF-1',
        amounts: AMOUNTS,
      });

      expect(screen.getByText(/REF-1/)).toBeInTheDocument();
      expect(screen.getByText(formatCOP(AMOUNTS.total).replace(/\s/g, ' '))).toBeInTheDocument();
    });

    it('does not show the progress list once the poll budget is exhausted', () => {
      renderResult({ status: 'PENDING', pollExhausted: true, pollStartedAt: Date.now() });

      expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    });
  });

  describe('overlay behavior (shared with Modal/Summary via useOverlayA11y)', () => {
    it('traps Tab focus within the overlay and marks sibling app content inert while mounted', () => {
      const sibling = document.createElement('div');
      document.body.appendChild(sibling);

      const { unmount } = renderResult({ status: 'APPROVED', reference: 'REF-1', amounts: AMOUNTS });

      expect(sibling).toHaveAttribute('aria-hidden', 'true');
      expect(sibling).toHaveAttribute('inert');

      unmount();

      expect(sibling).not.toHaveAttribute('aria-hidden');
      expect(sibling).not.toHaveAttribute('inert');
      document.body.removeChild(sibling);
    });

    it('cycles Tab focus from the last focusable control back to the first, within the RESULT overlay', async () => {
      const user = userEvent.setup();
      renderResult({ status: 'DECLINED', reference: 'REF-1' });

      screen.getByRole('button', { name: /back to store/i }).focus();
      await user.tab();

      expect(screen.getByRole('button', { name: /try again/i })).toHaveFocus();
    });
  });

  describe('APPROVED', () => {
    it('focuses the result heading', () => {
      renderResult({ status: 'APPROVED', reference: 'REF-1', amounts: AMOUNTS });

      expect(screen.getByRole('heading')).toHaveFocus();
    });

    it('shows the reference and the server-provided amounts breakdown', () => {
      renderResult({ status: 'APPROVED', reference: 'REF-1', amounts: AMOUNTS });

      expect(screen.getByText(/REF-1/)).toBeInTheDocument();
      expect(screen.getByText(formatCOP(AMOUNTS.productAmount).replace(/\s/g, ' '))).toBeInTheDocument();
      expect(screen.getByText(formatCOP(AMOUNTS.baseFee).replace(/\s/g, ' '))).toBeInTheDocument();
      expect(screen.getByText(formatCOP(AMOUNTS.deliveryFee).replace(/\s/g, ' '))).toBeInTheDocument();
      expect(screen.getByText(formatCOP(AMOUNTS.total).replace(/\s/g, ' '))).toBeInTheDocument();
    });

    it('shows the delivery address from LOCAL state, never a masked API value', () => {
      renderResult({ status: 'APPROVED', reference: 'REF-1', amounts: AMOUNTS, delivery: DELIVERY });

      expect(screen.getByText(/Cra 1 # 2-3/)).toBeInTheDocument();
      expect(screen.getByText(/Bogota/)).toBeInTheDocument();
      expect(screen.getByText(/Cundinamarca/)).toBeInTheDocument();
    });

    it('includes the postal code in the address when present', () => {
      renderResult({
        status: 'APPROVED',
        reference: 'REF-1',
        amounts: AMOUNTS,
        delivery: { ...DELIVERY, postalCode: '110111' },
      });

      expect(screen.getByText(/110111/)).toBeInTheDocument();
    });

    it('offers "Back to store" but NOT "Try again"', async () => {
      const { onBackToStore } = renderResult({ status: 'APPROVED', reference: 'REF-1', amounts: AMOUNTS });

      expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
      screen.getByRole('button', { name: /back to store/i }).click();
      expect(onBackToStore).toHaveBeenCalledTimes(1);
    });

    it('shows the approved (checkmark) result icon', () => {
      renderResult({ status: 'APPROVED', reference: 'REF-1', amounts: AMOUNTS });

      expect(screen.getByTestId('result-icon-check')).toBeInTheDocument();
    });

    describe('auto-return countdown', () => {
      beforeEach(() => {
        jest.useFakeTimers({ now: new Date(2026, 0, 1) });
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      /** Advances one second at a time so each re-scheduled tick is a pre-existing timer before the next advance. */
      async function advanceSeconds(times: number) {
        for (let i = 0; i < times; i += 1) {
          await act(async () => {
            await jest.advanceTimersByTimeAsync(1000);
          });
        }
      }

      it('shows a visible countdown from 10s, and offers "Back to store now" plus "Stay on this page"', async () => {
        renderResult({ status: 'APPROVED', reference: 'REF-1', amounts: AMOUNTS });

        expect(screen.getByText(/returning to the store in/i)).toHaveTextContent('10');
        expect(screen.getByRole('button', { name: /back to store now/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /stay on this page/i })).toBeInTheDocument();

        await advanceSeconds(3);

        expect(screen.getByText(/returning to the store in/i)).toHaveTextContent('7');
      });

      it('runs the same Back to store flow automatically once the countdown reaches zero', async () => {
        const { onBackToStore } = renderResult({ status: 'APPROVED', reference: 'REF-1', amounts: AMOUNTS });

        await advanceSeconds(10);

        expect(onBackToStore).toHaveBeenCalledTimes(1);
      });

      it('"Stay on this page" cancels the countdown, replaces the line with a note, and never auto-returns', async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        const { onBackToStore } = renderResult({ status: 'APPROVED', reference: 'REF-1', amounts: AMOUNTS });

        await user.click(screen.getByRole('button', { name: /stay on this page/i }));

        // Both the visible note and the (separate) SR-only live region say
        // this -- see the dedicated live-region test below for that split.
        expect(screen.getAllByText(/auto-return cancelled/i).length).toBeGreaterThan(0);
        expect(screen.queryByText(/returning to the store in/i)).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /stay on this page/i })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^back to store$/i })).toBeInTheDocument();

        await advanceSeconds(10);
        expect(onBackToStore).not.toHaveBeenCalled();
      });

      it('announces the countdown start, and its cancellation, via a visually-hidden polite live region (not every tick)', async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        renderResult({ status: 'APPROVED', reference: 'REF-1', amounts: AMOUNTS });

        const liveRegion = screen.getByTestId('auto-return-announcement');
        expect(liveRegion).toHaveAttribute('aria-live', 'polite');
        expect(liveRegion).toHaveTextContent(/returning to the store automatically/i);

        await advanceSeconds(3);
        // Ticking must not change the live region's (still-static) text.
        expect(liveRegion).toHaveTextContent(/returning to the store automatically/i);

        await user.click(screen.getByRole('button', { name: /stay on this page/i }));

        expect(liveRegion).toHaveTextContent(/auto-return cancelled/i);
      });
    });

    describe.each(['DECLINED', 'ERROR', 'VOIDED', 'PENDING'] as const)(
      'never shows the auto-return countdown when status is %s',
      (status) => {
        it('renders neither the countdown line nor "Stay on this page"', () => {
          renderResult({ status, reference: 'REF-1' });

          expect(screen.queryByText(/returning to the store in/i)).not.toBeInTheDocument();
          expect(screen.queryByRole('button', { name: /stay on this page/i })).not.toBeInTheDocument();
        });
      },
    );
  });

  describe.each(['DECLINED', 'ERROR', 'VOIDED'] as const)('%s (failure outcomes)', (status) => {
    it('focuses the result heading and shows a clear message', () => {
      renderResult({ status, reference: 'REF-1' });

      const heading = screen.getByRole('heading');
      expect(heading).toHaveFocus();
      expect(heading).toHaveTextContent(/payment/i);
      expect(screen.getAllByText(/payment/i).length).toBeGreaterThanOrEqual(1);
    });

    it('shows the failure (cross) result icon', () => {
      renderResult({ status, reference: 'REF-1' });

      expect(screen.getByTestId('result-icon-cross')).toBeInTheDocument();
    });

    it('offers both "Try again" and "Back to store"', () => {
      const { onTryAgain, onBackToStore } = renderResult({ status, reference: 'REF-1' });

      screen.getByRole('button', { name: /try again/i }).click();
      expect(onTryAgain).toHaveBeenCalledTimes(1);

      screen.getByRole('button', { name: /back to store/i }).click();
      expect(onBackToStore).toHaveBeenCalledTimes(1);
    });
  });

  describe('null status (defensive fallback)', () => {
    it('shows a fallback message and still offers Back to store', () => {
      const { onBackToStore } = renderResult({ status: null });

      expect(screen.getByText(/unable to load/i)).toBeInTheDocument();
      screen.getByRole('button', { name: /back to store/i }).click();
      expect(onBackToStore).toHaveBeenCalledTimes(1);
    });
  });
});
