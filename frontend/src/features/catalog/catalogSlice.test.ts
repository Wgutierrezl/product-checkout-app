import { configureStore } from '@reduxjs/toolkit';
import { catalogReducer } from './catalogSlice';
import { fetchProducts } from './catalogThunks';
import * as backendClient from '../../api/backendClient';
import { BackendApiError } from '../../api/types';

jest.mock('../../api/backendClient');

const mockedFetchProducts = backendClient.fetchProducts as jest.MockedFunction<
  typeof backendClient.fetchProducts
>;

function buildStore() {
  return configureStore({ reducer: { catalog: catalogReducer } });
}

const PRODUCT = {
  id: 'p1',
  name: 'Headphones',
  description: 'Noise-cancelling',
  price: 150_000,
  currency: 'COP' as const,
  stock: 5,
  imageUrl: 'https://img.test/p1.png',
};

describe('catalogSlice', () => {
  it('starts in idle status with an empty item list', () => {
    const store = buildStore();

    expect(store.getState().catalog).toEqual({ items: [], status: 'idle', error: null });
  });

  it('sets status to loading while fetchProducts is pending', () => {
    mockedFetchProducts.mockReturnValue(new Promise(() => {}));
    const store = buildStore();

    store.dispatch(fetchProducts());

    expect(store.getState().catalog.status).toBe('loading');
  });

  it('stores the fetched products and sets status to succeeded on success', async () => {
    mockedFetchProducts.mockResolvedValue([PRODUCT]);
    const store = buildStore();

    await store.dispatch(fetchProducts());

    expect(store.getState().catalog).toEqual({ items: [PRODUCT], status: 'succeeded', error: null });
  });

  it('sets status to failed with an error message when the fetch rejects', async () => {
    mockedFetchProducts.mockRejectedValue(new BackendApiError('Internal server error', 500));
    const store = buildStore();

    await store.dispatch(fetchProducts());

    const state = store.getState().catalog;
    expect(state.status).toBe('failed');
    expect(state.error).toBe('Internal server error');
    expect(state.items).toEqual([]);
  });

  it('falls back to a generic error message when the rejection carries none', async () => {
    mockedFetchProducts.mockRejectedValue({});
    const store = buildStore();

    await store.dispatch(fetchProducts());

    expect(store.getState().catalog.error).toBe('Failed to load products');
  });

  it('replaces the previous item list on a fresh successful fetch (e.g. after returning to the catalog)', async () => {
    mockedFetchProducts.mockResolvedValueOnce([PRODUCT]);
    const store = buildStore();
    await store.dispatch(fetchProducts());

    const restocked = { ...PRODUCT, stock: 2 };
    mockedFetchProducts.mockResolvedValueOnce([restocked]);
    await store.dispatch(fetchProducts());

    expect(store.getState().catalog.items).toEqual([restocked]);
  });
});
