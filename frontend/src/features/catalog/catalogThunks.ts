import { createAsyncThunk } from '@reduxjs/toolkit';
import * as backendClient from '../../api/backendClient';
import type { Product } from '../../api/types';

/**
 * Fetches the product list. Also used to refresh stock after returning to
 * the catalog from a completed purchase.
 */
export const fetchProducts = createAsyncThunk<Product[]>(
  'catalog/fetchProducts',
  async () => backendClient.fetchProducts(),
);
