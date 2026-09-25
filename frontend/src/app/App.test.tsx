import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { authReducer, initialAuthState, type AuthState } from '../features/auth/authSlice';
import { catalogReducer } from '../features/catalog/catalogSlice';
import { checkoutReducer, initialCheckoutState, type CheckoutState } from '../features/checkout/checkoutSlice';
import { initialTransactionState, transactionReducer, type TransactionState } from '../features/transaction/transactionSlice';
import * as backendClient from '../api/backendClient';

jest.mock('../api/backendClient');

const mockedFetchProducts = backendClient.fetchProducts as jest.MockedFunction<
  typeof backendClient.fetchProducts
>;
const mockedFetchPaymentAcceptance = backendClient.fetchPaymentAcceptance as jest.MockedFunction<
  typeof backendClient.fetchPaymentAcceptance
>;

function renderApp(
  checkoutOverrides: Partial<CheckoutState> = {},
  transactionOverrides: Partial<TransactionState> = {},
  authOverrides: Partial<AuthState> = {},
) {
  const store = configureStore({
    reducer: { catalog: catalogReducer, checkout: checkoutReducer, transaction: transactionReducer, auth: authReducer },
    preloadedState: {
      checkout: { ...initialCheckoutState, ...checkoutOverrides },
      transaction: { ...initialTransactionState, ...transactionOverrides },
      auth: { ...initialAuthState, ...authOverrides },
    },
  });
  return render(
    <Provider store={store}>
      <App />
    </Provider>,
  );
}

describe('App', () => {
  beforeEach(() => {
    mockedFetchProducts.mockReset();
    mockedFetchPaymentAcceptance.mockReset();
    mockedFetchPaymentAcceptance.mockReturnValue(new Promise(() => {}));
  });

  it('renders the store name in a banner landmark', () => {
    mockedFetchProducts.mockReturnValue(new Promise(() => {}));

    renderApp();

    expect(screen.getByRole('banner')).toHaveTextContent('Lumila');
  });

  it('renders a footer landmark with the store name and a security note', () => {
    mockedFetchProducts.mockReturnValue(new Promise(() => {}));

    renderApp();

    const footer = screen.getByRole('contentinfo');
    expect(footer).toHaveTextContent('Lumila');
    expect(footer).toHaveTextContent(/never store your card details/i);
  });

  it('renders the catalog inside a main landmark', async () => {
    mockedFetchProducts.mockResolvedValue([]);

    renderApp();

    const main = screen.getByRole('main');
    expect(await screen.findByText(/no products available/i)).toBeInTheDocument();
    expect(main).toContainElement(screen.getByText(/no products available/i));
  });

  it('does not render the payment modal while on the PRODUCT step', () => {
    mockedFetchProducts.mockReturnValue(new Promise(() => {}));

    renderApp();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the payment modal when the checkout step is DETAILS', () => {
    mockedFetchProducts.mockReturnValue(new Promise(() => {}));

    renderApp({ step: 'DETAILS', productId: 'p1', quantity: 1 });

    expect(screen.getByRole('dialog', { name: 'Payment details' })).toBeInTheDocument();
  });

  it('renders the order summary when the checkout step is SUMMARY', () => {
    mockedFetchProducts.mockReturnValue(new Promise(() => {}));

    renderApp({ step: 'SUMMARY', productId: 'p1', quantity: 1 });

    expect(screen.getByRole('region', { name: 'Order summary' })).toBeInTheDocument();
  });

  it('does not render the order summary while on the PRODUCT step', () => {
    mockedFetchProducts.mockReturnValue(new Promise(() => {}));

    renderApp();

    expect(screen.queryByRole('region', { name: 'Order summary' })).not.toBeInTheDocument();
  });

  it('renders the result screen when the checkout step is RESULT', () => {
    mockedFetchProducts.mockReturnValue(new Promise(() => {}));

    renderApp(
      { step: 'RESULT', productId: 'p1', quantity: 1 },
      { id: 't1', status: 'APPROVED', reference: 'REF-1' },
    );

    expect(screen.getByRole('heading', { name: /approved/i })).toBeInTheDocument();
  });

  it('does not render the result screen while on the PRODUCT step', () => {
    mockedFetchProducts.mockReturnValue(new Promise(() => {}));

    renderApp();

    expect(screen.queryByRole('heading', { name: /approved/i })).not.toBeInTheDocument();
  });

  describe('auth header menu', () => {
    it('shows Log in / Register in the header when logged out', () => {
      mockedFetchProducts.mockReturnValue(new Promise(() => {}));

      renderApp();

      expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /register/i })).toBeInTheDocument();
    });

    it('shows the account menu trigger (no Log in / Register) when authenticated', () => {
      mockedFetchProducts.mockReturnValue(new Promise(() => {}));

      renderApp({}, {}, { status: 'authenticated', token: 't', userId: 'u1', email: 'jane@example.com', fullName: 'Jane Doe' });

      expect(screen.getByRole('button', { name: /jane doe/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^log in$/i })).not.toBeInTheDocument();
    });

    it('opens the register modal when Register is clicked in the header', async () => {
      mockedFetchProducts.mockReturnValue(new Promise(() => {}));
      const user = userEvent.setup();
      renderApp();

      await user.click(screen.getByRole('button', { name: /register/i }));

      expect(screen.getByRole('dialog', { name: /create account/i })).toBeInTheDocument();
    });

    it('opens the login modal when Log in is clicked in the header', async () => {
      mockedFetchProducts.mockReturnValue(new Promise(() => {}));
      const user = userEvent.setup();
      renderApp();

      await user.click(screen.getByRole('button', { name: /log in/i }));

      expect(screen.getByRole('dialog', { name: /^log in$/i })).toBeInTheDocument();
    });

    it('closes the auth modal on Escape', async () => {
      mockedFetchProducts.mockReturnValue(new Promise(() => {}));
      const user = userEvent.setup();
      renderApp();
      await user.click(screen.getByRole('button', { name: /log in/i }));

      await user.keyboard('{Escape}');

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
