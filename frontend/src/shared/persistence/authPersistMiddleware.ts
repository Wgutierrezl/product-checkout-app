import type { Middleware } from '@reduxjs/toolkit';
import type { AuthState } from '../../features/auth/authSlice';
import { clearAuthSession, saveAuthSession } from './sessionAuthStorage';

export interface AuthPersistableState {
  auth: AuthState;
}

/**
 * Writes ONLY the `auth` slice to `sessionStorage` after every action —
 * completely separate from `persistMiddleware.ts`, which owns
 * `localStorage` and only ever knows about `checkout`/`transaction`. The
 * JWT access token must NEVER reach `localStorage`; this is the one and
 * only place the token is written to any Web Storage, and it always goes
 * to `sessionStorage`.
 */
export const authPersistMiddleware: Middleware<Record<string, never>, AuthPersistableState> =
  (store) => (next) => (action) => {
    const result = next(action);
    const { auth } = store.getState();

    if (auth.status === 'authenticated' && auth.token) {
      saveAuthSession({
        token: auth.token,
        userId: auth.userId ?? '',
        email: auth.email ?? '',
        fullName: auth.fullName ?? '',
      });
    } else {
      clearAuthSession();
    }

    return result;
  };
