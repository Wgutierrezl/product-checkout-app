import { createSlice } from '@reduxjs/toolkit';
import type { Product } from '../../api/types';
import { fetchProducts } from './catalogThunks';

export type CatalogStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

export interface CatalogState {
  items: Product[];
  status: CatalogStatus;
  error: string | null;
}

const initialState: CatalogState = {
  items: [],
  status: 'idle',
  error: null,
};

const catalogSlice = createSlice({
  name: 'catalog',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchProducts.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchProducts.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.items = action.payload;
      })
      .addCase(fetchProducts.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message ?? 'Failed to load products';
      });
  },
});

export const catalogReducer = catalogSlice.reducer;
export { fetchProducts };
