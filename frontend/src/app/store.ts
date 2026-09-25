import { configureStore } from '@reduxjs/toolkit';
import { catalogReducer } from '../features/catalog/catalogSlice';
import { authReducer, initialAuthState, type AuthState } from '../features/auth/authSlice';
import { checkoutReducer, initialCheckoutState } from '../features/checkout/checkoutSlice';
import { initialTransactionState, transactionReducer } from '../features/transaction/transactionSlice';
import { authPersistMiddleware } from '../shared/persistence/authPersistMiddleware';
import { loadPersistedState, persistMiddleware } from '../shared/persistence/persistMiddleware';
import { loadAuthSession } from '../shared/persistence/sessionAuthStorage';

const rootReducer = {
  catalog: catalogReducer,
  checkout: checkoutReducer,
  transaction: transactionReducer,
  auth: authReducer,
};

/**
 * A slice's `preloadedState` entry REPLACES that slice's initial state
 * wholesale — it is not merged field-by-field. Since persisted checkout/
 * transaction payloads only ever contain the whitelisted subset of fields
 * (see `persistMiddleware.ts`), every non-persisted field (`cardToken`,
 * `submitStatus`, `amounts`, ...) must be re-merged with the slice's own
 * defaults here, or it would rehydrate as `undefined`.
 */
/**
 * The auth session is rehydrated from `sessionStorage` (see
 * `sessionAuthStorage.ts`) — NEVER from `loadPersistedState()`, which only
 * ever reads `localStorage`'s checkout/transaction whitelist. This keeps
 * the JWT access token out of `localStorage` entirely, by construction.
 */
function buildAuthPreloadedState(): AuthState {
  const session = loadAuthSession();
  if (!session) {
    return initialAuthState;
  }
  return { status: 'authenticated', ...session };
}

function buildPreloadedState() {
  const persisted = loadPersistedState();

  return {
    checkout: persisted ? { ...initialCheckoutState, ...persisted.checkout } : initialCheckoutState,
    transaction: persisted ? { ...initialTransactionState, ...persisted.transaction } : initialTransactionState,
    auth: buildAuthPreloadedState(),
  };
}

export function createAppStore() {
  return configureStore({
    reducer: rootReducer,
    preloadedState: buildPreloadedState(),
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(persistMiddleware, authPersistMiddleware),
  });
}

export const store = createAppStore();

export type AppStore = ReturnType<typeof createAppStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];
