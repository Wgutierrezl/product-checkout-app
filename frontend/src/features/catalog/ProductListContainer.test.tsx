import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProductListContainer } from './ProductListContainer';
import { catalogReducer } from './catalogSlice';
import { checkoutReducer, initialCheckoutState, type CheckoutState } from '../checkout/checkoutSlice';
import { transactionReducer } from '../transaction/transactionSlice';
import * as backendClient from '../../api/backendClient';
import { BackendApiError } from '../../api/types';
import type { Product } from '../../api/types';

jest.mock('../../api/backendClient');

const mockedFetchProducts = backendClient.fetchProducts as jest.MockedFunction<
  typeof backendClient.fetchProducts
>;

const PRODUCT: Product = {
  id: 'p1',
  name: 'Wireless Headphones',
  description: 'Noise-cancelling over-ear headphones',
  price: 150_000,
  currency: 'COP',
  stock: 5,
  imageUrl: 'https://img.test/p1.png',
};

function buildStore(checkoutOverrides: Partial<CheckoutState> = {}) {
  return configureStore({
    reducer: { catalog: catalogReducer, checkout: checkoutReducer, transaction: transactionReducer },
    preloadedState: { checkout: { ...initialCheckoutState, ...checkoutOverrides } },
  });
}

function renderWithStore(store = buildStore()) {
  return { store, ...render(<Provider store={store}><ProductListContainer /></Provider>) };
}

describe('ProductListContainer', () => {
  beforeEach(() => {
    mockedFetchProducts.mockReset();
  });

  it('fetches products on mount and shows a loading state first', () => {
    mockedFetchProducts.mockReturnValue(new Promise(() => {}));

    renderWithStore();

    expect(mockedFetchProducts).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent(/loading products/i);
  });

  it('renders the product grid once products load', async () => {
    mockedFetchProducts.mockResolvedValue([PRODUCT]);

    renderWithStore();

    expect(await screen.findByRole('heading', { name: PRODUCT.name })).toBeInTheDocument();
  });

  it('renders an h2 section heading so product names (h3) nest under a proper h1->h2->h3 order', async () => {
    mockedFetchProducts.mockResolvedValue([PRODUCT]);

    renderWithStore();

    const sectionHeading = await screen.findByRole('heading', { level: 2 });
    expect(sectionHeading).toBeInTheDocument();
    const productHeading = screen.getByRole('heading', { level: 3, name: PRODUCT.name });
    expect(productHeading).toBeInTheDocument();
  });

  it('renders the h2 section heading even while loading', () => {
    mockedFetchProducts.mockReturnValue(new Promise(() => {}));

    renderWithStore();

    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
  });

  it('shows an empty-catalog message with a decorative illustration when the backend returns zero products', async () => {
    mockedFetchProducts.mockResolvedValue([]);

    renderWithStore();

    expect(await screen.findByText(/no products available/i)).toBeInTheDocument();
    expect(screen.getByTestId('empty-state-illustration')).toBeInTheDocument();
  });

  it('shows an error message with a decorative illustration and a retry action when the fetch fails', async () => {
    mockedFetchProducts.mockRejectedValueOnce(new BackendApiError('Internal server error', 500));

    renderWithStore();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Internal server error');
    expect(screen.getByTestId('error-state-illustration')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('re-fetches the catalog when Retry is clicked', async () => {
    mockedFetchProducts.mockRejectedValueOnce(new BackendApiError('Internal server error', 500));
    const user = userEvent.setup();
    renderWithStore();
    await screen.findByRole('alert');

    mockedFetchProducts.mockResolvedValueOnce([PRODUCT]);
    await user.click(screen.getByRole('button', { name: /retry/i }));

    expect(await screen.findByRole('heading', { name: PRODUCT.name })).toBeInTheDocument();
    expect(mockedFetchProducts).toHaveBeenCalledTimes(2);
  });

  it('selects the product/quantity and moves the checkout step to DETAILS when bought', async () => {
    mockedFetchProducts.mockResolvedValue([PRODUCT]);
    const user = userEvent.setup();
    const { store } = renderWithStore();
    await screen.findByRole('heading', { name: PRODUCT.name });

    await user.click(screen.getByRole('button', { name: /pay with credit card/i }));

    const { checkout } = store.getState();
    expect(checkout.productId).toBe(PRODUCT.id);
    expect(checkout.quantity).toBe(1);
    expect(checkout.step).toBe('DETAILS');
  });

  describe('stock-conflict banner (checkout.submitError while on PRODUCT)', () => {
    it('shows the checkout submitError as a dismissible banner while on the PRODUCT step', async () => {
      mockedFetchProducts.mockResolvedValue([PRODUCT]);
      renderWithStore(buildStore({ step: 'PRODUCT', submitError: 'Insufficient stock' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Insufficient stock');
    });

    it('dismisses the banner and clears checkout.submitError when the dismiss button is clicked', async () => {
      mockedFetchProducts.mockResolvedValue([PRODUCT]);
      const user = userEvent.setup();
      const { store } = renderWithStore(buildStore({ step: 'PRODUCT', submitError: 'Insufficient stock' }));
      await screen.findByRole('alert');

      await user.click(screen.getByRole('button', { name: /dismiss/i }));

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(store.getState().checkout.submitError).toBeNull();
    });

    it('does not show the banner when there is no checkout submitError', async () => {
      mockedFetchProducts.mockResolvedValue([PRODUCT]);
      renderWithStore(buildStore({ step: 'PRODUCT', submitError: null }));

      await screen.findByRole('heading', { name: PRODUCT.name });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });
});
