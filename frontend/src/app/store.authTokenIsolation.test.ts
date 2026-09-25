import { loggedIn, loggedOut } from '../features/auth/authSlice';
import { AUTH_STORAGE_KEY } from '../shared/persistence/sessionAuthStorage';
import { STORAGE_KEY } from '../shared/persistence/persistMiddleware';
import { createAppStore } from './store';

const SESSION = {
  token: 'jwt.super.secret.token',
  userId: 'u1',
  email: 'jane@example.com',
  fullName: 'Jane Doe',
  expiresAt: Date.now() + 3_600_000,
};

/**
 * Hard regression: the JWT access token (and the whole auth session) MUST
 * NEVER be written to `localStorage`, under any action sequence, through
 * the REAL store (`createAppStore()`, wired with both `persistMiddleware`
 * and `authPersistMiddleware`) — not a hand-assembled test store. It must
 * land in `sessionStorage` instead.
 */
describe('auth token isolation (regression)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('never writes the token, or any auth field, to localStorage after loggedIn', () => {
    const store = createAppStore();

    store.dispatch(loggedIn(SESSION));

    const rawLocalStorage = JSON.stringify(Object.entries(localStorage));
    expect(rawLocalStorage).not.toContain(SESSION.token);
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();

    const persistedCheckout = localStorage.getItem(STORAGE_KEY);
    if (persistedCheckout) {
      expect(persistedCheckout).not.toContain(SESSION.token);
      expect(JSON.parse(persistedCheckout)).not.toHaveProperty('auth');
    }
  });

  it('writes the token to sessionStorage instead', () => {
    const store = createAppStore();

    store.dispatch(loggedIn(SESSION));

    const persisted = JSON.parse(sessionStorage.getItem(AUTH_STORAGE_KEY) as string);
    expect(persisted.token).toBe(SESSION.token);
  });

  it('rehydrates an authenticated session from sessionStorage on boot, independent of localStorage', () => {
    sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(SESSION));

    const store = createAppStore();

    expect(store.getState().auth).toEqual({ status: 'authenticated', ...SESSION });
    expect(localStorage.length).toBe(0);
  });

  it('clears the token from sessionStorage on logout, still without ever touching localStorage', () => {
    const store = createAppStore();
    store.dispatch(loggedIn(SESSION));

    store.dispatch(loggedOut());

    expect(sessionStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });

  it('does NOT rehydrate an expired session on boot — starts anonymous and wipes it from sessionStorage', () => {
    sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ ...SESSION, expiresAt: Date.now() - 1 }));

    const store = createAppStore();

    expect(store.getState().auth.status).toBe('anonymous');
    expect(sessionStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    expect(localStorage.length).toBe(0);
  });
});
