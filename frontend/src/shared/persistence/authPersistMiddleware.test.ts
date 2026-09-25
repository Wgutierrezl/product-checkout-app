import { configureStore } from '@reduxjs/toolkit';
import { authReducer, loggedIn, loggedOut } from '../../features/auth/authSlice';
import { AUTH_STORAGE_KEY } from './sessionAuthStorage';
import { authPersistMiddleware } from './authPersistMiddleware';

const SESSION = {
  token: 'jwt.token.value',
  userId: 'u1',
  email: 'jane@example.com',
  fullName: 'Jane Doe',
  expiresAt: Date.now() + 3_600_000,
};

function buildStore() {
  return configureStore({
    reducer: { auth: authReducer },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(authPersistMiddleware),
  });
}

describe('authPersistMiddleware', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it('writes the auth session to sessionStorage after loggedIn', () => {
    const store = buildStore();

    store.dispatch(loggedIn(SESSION));

    const persisted = JSON.parse(sessionStorage.getItem(AUTH_STORAGE_KEY) as string);
    expect(persisted).toEqual(SESSION);
  });

  it('clears the session from sessionStorage after loggedOut', () => {
    const store = buildStore();
    store.dispatch(loggedIn(SESSION));

    store.dispatch(loggedOut());

    expect(sessionStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });

  it('never writes the token (or anything else) to localStorage', () => {
    const store = buildStore();

    store.dispatch(loggedIn(SESSION));

    expect(localStorage.length).toBe(0);
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });

  it('does not write to sessionStorage while still anonymous', () => {
    const store = buildStore();

    store.dispatch({ type: 'noop' });

    expect(sessionStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });

  it('includes expiresAt in the persisted session', () => {
    const store = buildStore();

    store.dispatch(loggedIn(SESSION));

    const persisted = JSON.parse(sessionStorage.getItem(AUTH_STORAGE_KEY) as string);
    expect(persisted.expiresAt).toBe(SESSION.expiresAt);
  });
});
