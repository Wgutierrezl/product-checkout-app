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
      expYear: '2030',
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

  it('prefills customer/delivery from the store for refresh resilience', () => {
    const savedCustomer = { fullName: 'Jane Doe', email: 'jane@example.com', phone: '+573001234567' };
    renderWithStore(buildStore({ customer: savedCustomer }));

    expect(screen.getByLabelText(/full name/i)).toHaveValue('Jane Doe');
  });
});
