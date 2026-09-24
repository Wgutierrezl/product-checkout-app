import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { TransactionStatus } from '../../api/types';

export interface TransactionAmounts {
  productAmount: number;
  baseFee: number;
  deliveryFee: number;
  total: number;
  currency: 'COP';
}

export interface TransactionState {
  id: string | null;
  status: TransactionStatus | null;
  amounts: TransactionAmounts | null;
  /** Human-facing reference shown on the RESULT screen; always sourced from the API, never persisted. */
  reference: string | null;
  error: string | null;
  pollStartedAt: number | null;
}

export const initialTransactionState: TransactionState = {
  id: null,
  status: null,
  amounts: null,
  reference: null,
  error: null,
  pollStartedAt: null,
};

const transactionSlice = createSlice({
  name: 'transaction',
  initialState: initialTransactionState,
  reducers: {
    transactionReceived: (
      state,
      action: PayloadAction<{ id: string; status: TransactionStatus; amounts: TransactionAmounts; reference: string }>,
    ) => {
      state.id = action.payload.id;
      state.status = action.payload.status;
      state.amounts = action.payload.amounts;
      state.reference = action.payload.reference;
      state.error = null;
    },
    pollStarted: (state, action: PayloadAction<number>) => {
      state.pollStartedAt = action.payload;
    },
    transactionErrorSet: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
    transactionCleared: () => initialTransactionState,
  },
});

export const { transactionReceived, pollStarted, transactionErrorSet, transactionCleared } =
  transactionSlice.actions;

export const transactionReducer = transactionSlice.reducer;
