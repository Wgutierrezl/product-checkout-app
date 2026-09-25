import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Summary } from './Summary';
import { formatCOP } from '../../domain/money/formatCOP';
import { computeOrderPreview } from '../../domain/checkout/orderPreview';
import type { DeliveryInput } from '../../api/types';
import type { CardSummary } from './checkoutSlice';

const PRODUCT = { name: 'Wireless Headphones', imageUrl: 'https://img.test/p1.png', quantity: 2, price: 150_000 };
const CARD_SUMMARY: CardSummary = { brand: 'visa', last4: '1111', holder: 'Jane Doe' };
const DELIVERY: DeliveryInput = { address: 'Cra 1 # 2-3', city: 'Bogota', region: 'Cundinamarca' };
const ACCEPTANCE_LINKS = { termsUrl: 'https://gateway.test/terms', personalDataUrl: 'https://gateway.test/auth' };

function renderSummary(overrides: Partial<React.ComponentProps<typeof Summary>> = {}) {
  const onPay = jest.fn();
  const onEditDetails = jest.fn();
  const onToggleTerms = jest.fn();
  const onTogglePersonalData = jest.fn();
  const utils = render(
    <Summary
      product={PRODUCT}
      cardSummary={CARD_SUMMARY}
      delivery={DELIVERY}
      acceptanceLinks={ACCEPTANCE_LINKS}
      acceptanceError={null}
      termsAccepted={false}
      personalDataAccepted={false}
      onToggleTerms={onToggleTerms}
      onTogglePersonalData={onTogglePersonalData}
      isSubmitting={false}
      submitError={null}
      onPay={onPay}
      onEditDetails={onEditDetails}
      {...overrides}
    />,
  );
  return { ...utils, onPay, onEditDetails, onToggleTerms, onTogglePersonalData };
}

describe('Summary', () => {
  it('shows the dimmed product context (image, name, quantity) behind the sheet', () => {
    renderSummary();

    expect(screen.getByRole('img', { name: PRODUCT.name })).toBeInTheDocument();
    expect(screen.getByText(PRODUCT.name)).toBeInTheDocument();
    expect(screen.getByText(/qty:\s*2/i)).toBeInTheDocument();
  });

  it('shows a COP breakdown: product amount, base fee, delivery fee, and total', () => {
    renderSummary();

    const preview = computeOrderPreview({ unitPrice: PRODUCT.price, quantity: PRODUCT.quantity });
    expect(screen.getByText(formatCOP(preview.productAmount).replace(/\s/g, ' '))).toBeInTheDocument();
    expect(screen.getByText(formatCOP(preview.baseFee).replace(/\s/g, ' '))).toBeInTheDocument();
    expect(screen.getByText(formatCOP(preview.deliveryFee).replace(/\s/g, ' '))).toBeInTheDocument();
    expect(screen.getAllByText(formatCOP(preview.total).replace(/\s/g, ' ')).length).toBeGreaterThan(0);
  });

  it('labels the breakdown as an estimate', () => {
    renderSummary();

    expect(screen.getByText(/estimate/i)).toBeInTheDocument();
  });

  it('shows the masked card summary (brand mark, last4, holder)', () => {
    renderSummary();

    expect(screen.getByRole('img', { name: 'Visa' })).toBeInTheDocument();
    expect(screen.getByText(/••••\s*1111/)).toBeInTheDocument();
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
  });

  it('shows the delivery address from local state', () => {
    renderSummary();

    expect(screen.getByText(/Cra 1 # 2-3/)).toBeInTheDocument();
    expect(screen.getByText(/Bogota/)).toBeInTheDocument();
    expect(screen.getByText(/Cundinamarca/)).toBeInTheDocument();
  });

  it('includes the postal code in the address when present', () => {
    renderSummary({ delivery: { ...DELIVERY, postalCode: '110111' } });

    expect(screen.getByText(/110111/)).toBeInTheDocument();
  });

  it('renders no address paragraph when delivery is not yet available', () => {
    renderSummary({ delivery: null });

    expect(screen.queryByText(/Cra 1 # 2-3/)).not.toBeInTheDocument();
  });

  it('renders no card row when cardSummary is not yet available', () => {
    renderSummary({ cardSummary: null });

    expect(screen.queryByRole('img', { name: 'Visa' })).not.toBeInTheDocument();
  });

  it('renders both acceptance checkboxes linking to their permalinks, opened safely in a new tab', () => {
    renderSummary();

    const termsLink = screen.getByRole('link', { name: /terms/i });
    expect(termsLink).toHaveAttribute('href', ACCEPTANCE_LINKS.termsUrl);
    expect(termsLink).toHaveAttribute('target', '_blank');
    expect(termsLink).toHaveAttribute('rel', expect.stringContaining('noopener'));

    const personalDataLink = screen.getByRole('link', { name: /personal data/i });
    expect(personalDataLink).toHaveAttribute('href', ACCEPTANCE_LINKS.personalDataUrl);
    expect(personalDataLink).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('keeps Pay disabled until both checkboxes are accepted', () => {
    renderSummary({ termsAccepted: false, personalDataAccepted: false });

    expect(screen.getByRole('button', { name: /^pay$/i })).toBeDisabled();
  });

  it('keeps Pay disabled when only one checkbox is accepted', () => {
    renderSummary({ termsAccepted: true, personalDataAccepted: false });

    expect(screen.getByRole('button', { name: /^pay$/i })).toBeDisabled();
  });

  it('enables Pay once both checkboxes are accepted and acceptance links are loaded', () => {
    renderSummary({ termsAccepted: true, personalDataAccepted: true });

    expect(screen.getByRole('button', { name: /^pay$/i })).toBeEnabled();
  });

  it('keeps Pay disabled while acceptance links have not loaded yet, even if both boxes are checked', () => {
    renderSummary({ termsAccepted: true, personalDataAccepted: true, acceptanceLinks: null });

    expect(screen.getByRole('button', { name: /^pay$/i })).toBeDisabled();
  });

  it('calls onToggleTerms/onTogglePersonalData when each checkbox is clicked', async () => {
    const user = userEvent.setup();
    const { onToggleTerms, onTogglePersonalData } = renderSummary();

    await user.click(screen.getByRole('checkbox', { name: /terms/i }));
    await user.click(screen.getByRole('checkbox', { name: /personal data/i }));

    expect(onToggleTerms).toHaveBeenCalledTimes(1);
    expect(onTogglePersonalData).toHaveBeenCalledTimes(1);
  });

  it('calls onPay when Pay is clicked while enabled', async () => {
    const user = userEvent.setup();
    const { onPay } = renderSummary({ termsAccepted: true, personalDataAccepted: true });

    await user.click(screen.getByRole('button', { name: /^pay$/i }));

    expect(onPay).toHaveBeenCalledTimes(1);
  });

  it('calls onEditDetails when "Edit details" is clicked', async () => {
    const user = userEvent.setup();
    const { onEditDetails } = renderSummary();

    await user.click(screen.getByRole('button', { name: /edit details/i }));

    expect(onEditDetails).toHaveBeenCalledTimes(1);
  });

  it('shows a processing label and disables Pay while isSubmitting is true', () => {
    renderSummary({ termsAccepted: true, personalDataAccepted: true, isSubmitting: true });

    expect(screen.getByRole('button', { name: /processing/i })).toBeDisabled();
  });

  it('marks the Pay button aria-busy while isSubmitting is true', () => {
    renderSummary({ termsAccepted: true, personalDataAccepted: true, isSubmitting: true });

    expect(screen.getByRole('button', { name: /processing payment/i })).toHaveAttribute('aria-busy', 'true');
  });

  it('shows an inline status line announcing progress via role=status while paying', () => {
    renderSummary({ termsAccepted: true, personalDataAccepted: true, isSubmitting: true });

    expect(screen.getByRole('status')).toHaveTextContent(/processing your payment/i);
  });

  it('keeps the status line in the same (sticky on mobile) footer as the action buttons', () => {
    renderSummary({ termsAccepted: true, personalDataAccepted: true, isSubmitting: true });

    const footer = screen.getByRole('status').parentElement;
    expect(footer).toHaveClass('footer');
    expect(footer).toContainElement(screen.getByRole('button', { name: /edit details/i }));
    expect(footer).toContainElement(screen.getByRole('button', { name: /processing payment/i }));
  });

  it('visually disables the consent checkboxes (fieldset disabled) while paying', () => {
    renderSummary({ termsAccepted: true, personalDataAccepted: true, isSubmitting: true });

    const [terms, personalData] = screen.getAllByRole('checkbox');
    expect(terms).toBeDisabled();
    expect(personalData).toBeDisabled();
  });

  it('shows the submit error as an alert', () => {
    renderSummary({ submitError: 'Insufficient stock' });

    expect(screen.getByRole('alert')).toHaveTextContent('Insufficient stock');
  });

  it('shows the acceptance-load error and disables Pay when acceptance links failed to load', () => {
    renderSummary({
      acceptanceLinks: null,
      acceptanceError: 'Could not load terms, please retry',
      termsAccepted: true,
      personalDataAccepted: true,
    });

    expect(screen.getByText('Could not load terms, please retry')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^pay$/i })).toBeDisabled();
  });

  it('renders a fallback message and still offers Edit details when the product is unavailable', async () => {
    const user = userEvent.setup();
    const { onEditDetails } = renderSummary({ product: null });

    expect(screen.getByText(/unable to load order details/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /edit details/i }));
    expect(onEditDetails).toHaveBeenCalledTimes(1);
  });

  it('disables Edit details while isSubmitting is true', () => {
    renderSummary({ isSubmitting: true });

    expect(screen.getByRole('button', { name: /edit details/i })).toBeDisabled();
  });

  describe('overlay behavior (shared with Modal via useOverlayA11y)', () => {
    it('focuses the "Order summary" heading on mount', () => {
      renderSummary();

      expect(screen.getByRole('heading', { name: 'Order summary' })).toHaveFocus();
    });

    it('calls onEditDetails when Escape is pressed', async () => {
      const user = userEvent.setup();
      const { onEditDetails } = renderSummary();

      await user.keyboard('{Escape}');

      expect(onEditDetails).toHaveBeenCalledTimes(1);
    });

    it('traps Tab focus: cycles from the last focusable control back to the first', async () => {
      const user = userEvent.setup();
      renderSummary({ termsAccepted: true, personalDataAccepted: true });

      screen.getByRole('button', { name: /^pay$/i }).focus();
      await user.tab();

      expect(screen.getByRole('checkbox', { name: /terms/i })).toHaveFocus();
    });

    it('marks sibling app content aria-hidden and inert while mounted, restoring on unmount', () => {
      const sibling = document.createElement('div');
      document.body.appendChild(sibling);

      const { unmount } = renderSummary();

      expect(sibling).toHaveAttribute('aria-hidden', 'true');
      expect(sibling).toHaveAttribute('inert');

      unmount();

      expect(sibling).not.toHaveAttribute('aria-hidden');
      expect(sibling).not.toHaveAttribute('inert');
      document.body.removeChild(sibling);
    });
  });
});
