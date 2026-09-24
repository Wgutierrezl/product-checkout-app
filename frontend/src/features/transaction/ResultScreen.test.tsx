import { render, screen } from '@testing-library/react';
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

    it('offers "Back to store" but NOT "Try again"', async () => {
      const { onBackToStore } = renderResult({ status: 'APPROVED', reference: 'REF-1', amounts: AMOUNTS });

      expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
      screen.getByRole('button', { name: /back to store/i }).click();
      expect(onBackToStore).toHaveBeenCalledTimes(1);
    });
  });

  describe.each(['DECLINED', 'ERROR', 'VOIDED'] as const)('%s (failure outcomes)', (status) => {
    it('focuses the result heading and shows a clear message', () => {
      renderResult({ status, reference: 'REF-1' });

      const heading = screen.getByRole('heading');
      expect(heading).toHaveFocus();
      expect(heading).toHaveTextContent(/payment/i);
      expect(screen.getAllByText(/payment/i).length).toBeGreaterThanOrEqual(1);
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
