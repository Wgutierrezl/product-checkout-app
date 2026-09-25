import { useDispatch, useSelector, useStore, type TypedUseSelectorHook } from 'react-redux';
import type { AppDispatch, AppStore, RootState } from './store';

/** Typed `useDispatch`/`useSelector`/`useStore` — use these instead of the plain react-redux hooks everywhere. */
export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
/**
 * Escape hatch for the rare case where a component needs the FRESH state
 * right after a dispatch, in the same synchronous tick (e.g. reading a
 * just-ensured idempotency key before an immediate API call) — a selector
 * value captured via `useAppSelector` is only updated on the NEXT render,
 * but `store.getState()` reflects the latest state immediately.
 */
export function useAppStore(): AppStore {
  return useStore<RootState>() as AppStore;
}
