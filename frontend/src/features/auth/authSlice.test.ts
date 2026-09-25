import { authReducer, initialAuthState, loggedIn, loggedOut } from './authSlice';

const SESSION = {
  token: 'jwt.token.value',
  userId: 'u1',
  email: 'jane@example.com',
  fullName: 'Jane Doe',
};

describe('authSlice', () => {
  it('starts anonymous with every field null', () => {
    expect(authReducer(undefined, { type: '@@INIT' })).toEqual({
      status: 'anonymous',
      token: null,
      userId: null,
      email: null,
      fullName: null,
    });
  });

  it('transitions anonymous -> authenticated on loggedIn, storing the session fields', () => {
    const state = authReducer(initialAuthState, loggedIn(SESSION));

    expect(state).toEqual({ status: 'authenticated', ...SESSION });
  });

  it('transitions authenticated -> anonymous on loggedOut, clearing every field', () => {
    const authenticated = authReducer(initialAuthState, loggedIn(SESSION));

    const state = authReducer(authenticated, loggedOut());

    expect(state).toEqual(initialAuthState);
  });

  it('loggedOut on an already-anonymous state is a no-op', () => {
    const state = authReducer(initialAuthState, loggedOut());

    expect(state).toEqual(initialAuthState);
  });
});
