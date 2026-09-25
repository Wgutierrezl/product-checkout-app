import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HeaderAccountMenu } from './HeaderAccountMenu';
import { authReducer, initialAuthState, type AuthState } from './authSlice';

function renderMenu(authState: AuthState = initialAuthState) {
  const store = configureStore({ reducer: { auth: authReducer }, preloadedState: { auth: authState } });
  const onOpenAuth = jest.fn();
  const utils = render(
    <Provider store={store}>
      <HeaderAccountMenu onOpenAuth={onOpenAuth} />
    </Provider>,
  );
  return { ...utils, store, onOpenAuth };
}

const AUTHENTICATED: AuthState = {
  status: 'authenticated',
  token: 'jwt.token.value',
  userId: 'u1',
  email: 'jane@example.com',
  fullName: 'Jane Doe',
  expiresAt: Date.now() + 3_600_000,
};

describe('HeaderAccountMenu', () => {
  describe('logged out', () => {
    it('shows Log in and Register entries, no account/logout entries', () => {
      renderMenu();

      expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /register/i })).toBeInTheDocument();
      expect(screen.queryByText(/log out/i)).not.toBeInTheDocument();
    });

    it('calls onOpenAuth("login") when Log in is clicked', async () => {
      const user = userEvent.setup();
      const { onOpenAuth } = renderMenu();

      await user.click(screen.getByRole('button', { name: /log in/i }));

      expect(onOpenAuth).toHaveBeenCalledWith('login');
    });

    it('calls onOpenAuth("register") when Register is clicked', async () => {
      const user = userEvent.setup();
      const { onOpenAuth } = renderMenu();

      await user.click(screen.getByRole('button', { name: /register/i }));

      expect(onOpenAuth).toHaveBeenCalledWith('register');
    });
  });

  describe('logged in', () => {
    it('shows an account/logout entry, no login/register entries', () => {
      renderMenu(AUTHENTICATED);

      expect(screen.getByRole('button', { name: /jane doe/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^log in$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^register$/i })).not.toBeInTheDocument();
    });

    it('opens a menu with a Log out item when the account trigger is activated', async () => {
      const user = userEvent.setup();
      renderMenu(AUTHENTICATED);

      await user.click(screen.getByRole('button', { name: /jane doe/i }));

      expect(screen.getByRole('menu')).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: /log out/i })).toBeInTheDocument();
    });

    it('dispatches loggedOut when Log out is activated', async () => {
      const user = userEvent.setup();
      const { store } = renderMenu(AUTHENTICATED);

      await user.click(screen.getByRole('button', { name: /jane doe/i }));
      await user.click(screen.getByRole('menuitem', { name: /log out/i }));

      expect(store.getState().auth.status).toBe('anonymous');
    });

    it('closes the menu on Escape', async () => {
      const user = userEvent.setup();
      renderMenu(AUTHENTICATED);
      await user.click(screen.getByRole('button', { name: /jane doe/i }));

      await user.keyboard('{Escape}');

      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });

  describe('session expiry auto-logout', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    function authenticatedExpiringIn(ms: number): AuthState {
      return { ...AUTHENTICATED, expiresAt: Date.now() + ms };
    }

    it('dispatches loggedOut automatically once expiresAt passes while mounted (covers boot rehydration too)', () => {
      const { store } = renderMenu(authenticatedExpiringIn(1000));

      act(() => {
        jest.advanceTimersByTime(1000);
      });

      expect(store.getState().auth.status).toBe('anonymous');
    });

    it('does not log out before expiresAt has passed', () => {
      const { store } = renderMenu(authenticatedExpiringIn(5000));

      act(() => {
        jest.advanceTimersByTime(2000);
      });

      expect(store.getState().auth.status).toBe('authenticated');
    });

    it('clears the scheduled auto-logout on unmount, so it never fires afterwards', () => {
      const { store, unmount } = renderMenu(authenticatedExpiringIn(1000));

      unmount();
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      expect(store.getState().auth.status).toBe('authenticated');
    });

    it('does not schedule anything while logged out', () => {
      const { store } = renderMenu(initialAuthState);

      act(() => {
        jest.advanceTimersByTime(10_000_000);
      });

      expect(store.getState().auth.status).toBe('anonymous');
    });
  });
});
