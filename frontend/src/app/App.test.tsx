import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { render, screen } from '@testing-library/react';
import { App } from './App';
import { catalogReducer } from '../features/catalog/catalogSlice';
import { checkoutReducer, initialCheckoutState, type CheckoutState } from '../features/checkout/checkoutSlice';
import { transactionReducer } from '../features/transaction/transactionSlice';
import * as backendClient from '../api/backendClient';

jest.mock('../api/backendClient');

const mockedFetchProducts = backendClient.fetchProducts as jest.MockedFunction<
  typeof backendClient.fetchProducts
>;
const mockedFetchPaymentAcceptance = backendClient.fetchPaymentAcceptance as jest.MockedFunction<
  typeof backendClient.fetchPaymentAcceptance
>;

function renderApp(checkoutOverrides: Partial<CheckoutState> = {}) {
  const store = configureStore({
    reducer: { catalog: catalogReducer, checkout: checkoutReducer, transaction: transactionReducer },
    preloadedState: { checkout: { ...initialCheckoutState, ...checkoutOverrides } },
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

    expect(screen.getByRole('banner')).toHaveTextContent('Meridian Goods');
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
});
