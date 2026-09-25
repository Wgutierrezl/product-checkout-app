import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type AuthStatus = 'anonymous' | 'authenticated';

export interface AuthState {
  status: AuthStatus;
  token: string | null;
  userId: string | null;
  email: string | null;
  fullName: string | null;
}

export const initialAuthState: AuthState = {
  status: 'anonymous',
  token: null,
  userId: null,
  email: null,
  fullName: null,
};

export interface LoggedInPayload {
  token: string;
  userId: string;
  email: string;
  fullName: string;
}

/**
 * Session state for an optional account layer on top of an otherwise
 * guest-only checkout. Deliberately separate from `checkoutSlice` — a
 * signed-in buyer's checkout state is completely unaffected by this slice,
 * and this slice never gates guest checkout in any way.
 *
 * The token here is NEVER persisted to `localStorage`: it is rehydrated
 * from `sessionStorage` on boot (see `store.ts`/`sessionAuthStorage.ts`)
 * and kept in sync there by `authPersistMiddleware`, entirely separate from
 * `persistMiddleware.ts`'s `localStorage` whitelist.
 */
const authSlice = createSlice({
  name: 'auth',
  initialState: initialAuthState,
  reducers: {
    loggedIn(state, action: PayloadAction<LoggedInPayload>) {
      state.status = 'authenticated';
      state.token = action.payload.token;
      state.userId = action.payload.userId;
      state.email = action.payload.email;
      state.fullName = action.payload.fullName;
    },
    loggedOut() {
      return initialAuthState;
    },
  },
});

export const { loggedIn, loggedOut } = authSlice.actions;
export const authReducer = authSlice.reducer;
