import { StrictMode } from 'react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaymentModalContainer } from './PaymentModalContainer';
import { checkoutReducer, initialCheckoutState, type CheckoutState } from './checkoutSlice';
import { catalogReducer } from '../catalog/catalogSlice';
import { transactionReducer } from '../transaction/transactionSlice';
import * as paymentGatewayClient from '../../api/paymentGatewayClient';
import { GatewayTokenizeError } from '../../api/types';

jest.mock('../../api/paymentGatewayClient');

const mockedTokenizeCard = paymentGatewayClient.tokenizeCard as jest.MockedFunction<
  typeof paymentGatewayClient.tokenizeCard
>;

function buildStore(preloadedCheckout: Partial<CheckoutState> = {}) {
  const checkout: CheckoutState = {
    ...initialCheckoutState,
    productId: 'p1',
    quantity: 1,
    step: 'DETAILS',
    ...preloadedCheckout,
  };

  return configureStore({
    reducer: { catalog: catalogReducer, checkout: checkoutReducer, transaction: transactionReducer },
    preloadedState: { checkout },
  });
}

function renderWithStore(store = buildStore()) {
  return { store, ...render(<Provider store={store}><PaymentModalContainer /></Provider>) };
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/card number/i), '4111111111111111');
  await user.type(screen.getByLabelText(/cardholder name/i), 'Jane Doe');
  await user.type(screen.getByLabelText(/expiry/i), '09/30');
  await user.type(screen.getByLabelText(/cvc/i), '123');
  await user.type(screen.getByLabelText(/full name/i), 'Jane Doe');
  await user.type(screen.getByLabelText(/email/i), 'jane@example.com');
  await user.type(screen.getByLabelText(/phone/i), '+573001234567');
  await user.type(screen.getByLabelText(/^address/i), 'Cra 1 # 2-3');
  await user.type(screen.getByLabelText(/city/i), 'Bogota');
  await user.type(screen.getByLabelText(/region/i), 'Cundinamarca');
}

describe('PaymentModalContainer', () => {
  beforeEach(() => {
    mockedTokenizeCard.mockReset();
  });

  it('renders the payment form inside a dialog titled "Payment details"', () => {
    renderWithStore();

    expect(screen.getByRole('dialog', { name: 'Payment details' })).toBeInTheDocument();
  });

  it('moves the step back to PRODUCT when Cancel is clicked, without dispatching card data', async () => {
    const user = userEvent.setup();
    const { store } = renderWithStore();

    await user.click(screen.getByRole('button', { name: /cancel/i }));

    const { checkout } = store.getState();
    expect(checkout.step).toBe('PRODUCT');
    expect(checkout.cardToken).toBeNull();
    expect(checkout.customer).toBeNull();
  });

  it('moves the step back to PRODUCT when Escape is pressed, keeping already-saved customer/delivery', async () => {
    const user = userEvent.setup();
    const savedCustomer = { fullName: 'Jane Doe', email: 'jane@example.com', phone: '+573001234567' };
    const savedDelivery = { address: 'Cra 1 # 2-3', city: 'Bogota', region: 'Cundinamarca' };
    const { store } = renderWithStore(buildStore({ customer: savedCustomer, delivery: savedDelivery }));

    await user.keyboard('{Escape}');

    const { checkout } = store.getState();
    expect(checkout.step).toBe('PRODUCT');
    expect(checkout.customer).toEqual(savedCustomer);
    expect(checkout.delivery).toEqual(savedDelivery);
  });

  it('tokenizes, stores cardSummary/cardToken/customer/delivery, and moves to SUMMARY on success', async () => {
    mockedTokenizeCard.mockResolvedValue({ cardToken: 'tok_test_card' });
    const user = userEvent.setup();
    const { store } = renderWithStore();

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /continue/i }));

    expect(mockedTokenizeCard).toHaveBeenCalledWith({
      number: '4111111111111111',
      cvc: '123',
      expMonth: '09',
      expYear: '30',
      cardHolder: 'Jane Doe',
    });

    await waitFor(() => expect(store.getState().checkout.step).toBe('SUMMARY'));

    const { checkout } = store.getState();
    expect(checkout.cardToken).toBe('tok_test_card');
    expect(checkout.cardSummary).toEqual({ brand: 'visa', last4: '1111', holder: 'Jane Doe' });
    expect(checkout.customer).toEqual({ fullName: 'Jane Doe', email: 'jane@example.com', phone: '+573001234567' });
    expect(checkout.delivery).toEqual({ address: 'Cra 1 # 2-3', city: 'Bogota', region: 'Cundinamarca' });
    expect(checkout.submitStatus).toBe('idle');
  });

  it('sends exp_month and exp_year as 2-digit strings to the gateway, regardless of the entered expiry', async () => {
    mockedTokenizeCard.mockResolvedValue({ cardToken: 'tok_test_card' });
    const user = userEvent.setup();
    renderWithStore();

    await user.type(screen.getByLabelText(/card number/i), '4111111111111111');
    await user.type(screen.getByLabelText(/cardholder name/i), 'Jane Doe');
    await user.type(screen.getByLabelText(/expiry/i), '05/29');
    await user.type(screen.getByLabelText(/cvc/i), '123');
    await user.type(screen.getByLabelText(/full name/i), 'Jane Doe');
    await user.type(screen.getByLabelText(/email/i), 'jane@example.com');
    await user.type(screen.getByLabelText(/phone/i), '+573001234567');
    await user.type(screen.getByLabelText(/^address/i), 'Cra 1 # 2-3');
    await user.type(screen.getByLabelText(/city/i), 'Bogota');
    await user.type(screen.getByLabelText(/region/i), 'Cundinamarca');
    await user.click(screen.getByRole('button', { name: /continue/i }));

    expect(mockedTokenizeCard).toHaveBeenCalledWith(
      expect.objectContaining({ expMonth: '05', expYear: '29' }),
    );
  });

  it('shows the tokenize failure inline and keeps the buyer on DETAILS without saving customer/delivery', async () => {
    mockedTokenizeCard.mockRejectedValue(new GatewayTokenizeError('Payment gateway rejected the card'));
    const user = userEvent.setup();
    const { store } = renderWithStore();

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /continue/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Payment gateway rejected the card');
    const { checkout } = store.getState();
    expect(checkout.step).toBe('DETAILS');
    expect(checkout.cardToken).toBeNull();
    expect(checkout.customer).toBeNull();
    expect(checkout.submitStatus).toBe('failed');
  });

  it('falls back to a generic tokenize-failure message when the rejection is not an Error', async () => {
    mockedTokenizeCard.mockRejectedValue('boom');
    const user = userEvent.setup();
    renderWithStore();

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /continue/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Card tokenization failed');
  });

  it('disables Continue and shows a processing state while tokenizing', async () => {
    mockedTokenizeCard.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    renderWithStore();

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /continue/i }));

    expect(await screen.findByRole('button', { name: /processing/i })).toBeDisabled();
  });

  describe('closing during an in-flight tokenize request (BLOCKER)', () => {
    it('disables Cancel while tokenizing', async () => {
      mockedTokenizeCard.mockReturnValue(new Promise(() => {}));
      const user = userEvent.setup();
      renderWithStore();

      await fillValidForm(user);
      await user.click(screen.getByRole('button', { name: /continue/i }));

      expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
    });

    it('ignores Escape while tokenizing, leaving the step unchanged', async () => {
      mockedTokenizeCard.mockReturnValue(new Promise(() => {}));
      const user = userEvent.setup();
      const { store } = renderWithStore();

      await fillValidForm(user);
      await user.click(screen.getByRole('button', { name: /continue/i }));
      await user.keyboard('{Escape}');

      expect(store.getState().checkout.step).toBe('DETAILS');
    });

    it('ignores a backdrop click while tokenizing, leaving the step unchanged', async () => {
      mockedTokenizeCard.mockReturnValue(new Promise(() => {}));
      const user = userEvent.setup();
      const { store } = renderWithStore();

      await fillValidForm(user);
      await user.click(screen.getByRole('button', { name: /continue/i }));
      await user.click(screen.getByTestId('backdrop'));

      expect(store.getState().checkout.step).toBe('DETAILS');
    });

    it('ignores a tokenize result that resolves after the container has unmounted', async () => {
      let resolveTokenize: ((value: { cardToken: string }) => void) | undefined;
      mockedTokenizeCard.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveTokenize = resolve;
          }),
      );
      const user = userEvent.setup();
      const { store, unmount } = renderWithStore();

      await fillValidForm(user);
      await user.click(screen.getByRole('button', { name: /continue/i }));

      unmount();
      resolveTokenize?.({ cardToken: 'tok_test_card' });
      await Promise.resolve();
      await Promise.resolve();

      const { checkout } = store.getState();
      expect(checkout.cardToken).toBeNull();
      expect(checkout.step).toBe('DETAILS');
      expect(checkout.customer).toBeNull();
    });

    it('ignores a tokenize REJECTION that resolves after the container has unmounted', async () => {
      let rejectTokenize: ((error: Error) => void) | undefined;
      mockedTokenizeCard.mockImplementation(
        () =>
          new Promise((_resolve, reject) => {
            rejectTokenize = reject;
          }),
      );
      const user = userEvent.setup();
      const { store, unmount } = renderWithStore();

      await fillValidForm(user);
      await user.click(screen.getByRole('button', { name: /continue/i }));

      unmount();
      rejectTokenize?.(new Error('boom'));
      await Promise.resolve();
      await Promise.resolve();

      expect(store.getState().checkout.submitStatus).toBe('tokenizing');
    });
  });

  it('does not stall tokenization under React StrictMode double-invocation (dev mode)', async () => {
    mockedTokenizeCard.mockResolvedValue({ cardToken: 'tok_test_card' });
    const user = userEvent.setup();
    const store = buildStore();

    render(
      <StrictMode>
        <Provider store={store}>
          <PaymentModalContainer />
        </Provider>
      </StrictMode>,
    );

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /continue/i }));

    await waitFor(() => expect(store.getState().checkout.step).toBe('SUMMARY'));
    expect(store.getState().checkout.cardToken).toBe('tok_test_card');
  });

  it('prefills customer/delivery from the store for refresh resilience', () => {
    const savedCustomer = { fullName: 'Jane Doe', email: 'jane@example.com', phone: '+573001234567' };
    renderWithStore(buildStore({ customer: savedCustomer }));

    expect(screen.getByLabelText(/full name/i)).toHaveValue('Jane Doe');
  });
});
