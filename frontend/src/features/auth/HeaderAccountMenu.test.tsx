import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { render, screen } from '@testing-library/react';
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
});
