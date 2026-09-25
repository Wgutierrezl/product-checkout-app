import { configureStore } from '@reduxjs/toolkit';
import { catalogReducer } from '../features/catalog/catalogSlice';
import { checkoutReducer, initialCheckoutState } from '../features/checkout/checkoutSlice';
import { initialTransactionState, transactionReducer } from '../features/transaction/transactionSlice';
import { loadPersistedState, persistMiddleware } from '../shared/persistence/persistMiddleware';

const rootReducer = {
  catalog: catalogReducer,
  checkout: checkoutReducer,
  transaction: transactionReducer,
};

/**
 * A slice's `preloadedState` entry REPLACES that slice's initial state
 * wholesale — it is not merged field-by-field. Since persisted checkout/
 * transaction payloads only ever contain the whitelisted subset of fields
 * (see `persistMiddleware.ts`), every non-persisted field (`cardToken`,
 * `submitStatus`, `amounts`, ...) must be re-merged with the slice's own
 * defaults here, or it would rehydrate as `undefined`.
 */
function buildPreloadedState() {
  const persisted = loadPersistedState();
  if (!persisted) {
    return undefined;
  }

  return {
    checkout: {
      ...initialCheckoutState,
      ...persisted.checkout,
      draftRestored: persisted.checkout.formDraft !== null,
    },
    transaction: { ...initialTransactionState, ...persisted.transaction },
  };
}

export function createAppStore() {
  return configureStore({
    reducer: rootReducer,
    preloadedState: buildPreloadedState(),
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(persistMiddleware),
  });
}

export const store = createAppStore();

export type AppStore = ReturnType<typeof createAppStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];
