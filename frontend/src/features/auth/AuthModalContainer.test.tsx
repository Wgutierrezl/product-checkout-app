import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthModalContainer } from './AuthModalContainer';
import { authReducer } from './authSlice';
import { BackendApiError } from '../../api/types';
import * as backendClient from '../../api/backendClient';

jest.mock('../../api/backendClient');

const mockedRegisterUser = backendClient.registerUser as jest.MockedFunction<typeof backendClient.registerUser>;
const mockedLoginUser = backendClient.loginUser as jest.MockedFunction<typeof backendClient.loginUser>;

function renderModal(view: 'login' | 'register', onClose = jest.fn()) {
  const store = configureStore({ reducer: { auth: authReducer } });
  const utils = render(
    <Provider store={store}>
      <AuthModalContainer view={view} onClose={onClose} />
    </Provider>,
  );
  return { ...utils, store, onClose };
}

describe('AuthModalContainer', () => {
  beforeEach(() => {
    mockedRegisterUser.mockReset();
    mockedLoginUser.mockReset();
  });

  it('renders the register form when view is "register"', () => {
    renderModal('register');

    expect(screen.getByRole('dialog', { name: /create account/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
  });

  it('renders the login form when view is "login"', () => {
    renderModal('login');

    expect(screen.getByRole('dialog', { name: /log in/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^email/i)).toBeInTheDocument();
  });

  it('switches from register to login internally without closing the modal', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal('register');

    await user.click(screen.getByRole('button', { name: /log in/i }));

    expect(screen.getByRole('dialog', { name: /log in/i })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('on successful login, dispatches loggedIn and closes the modal', async () => {
    const user = userEvent.setup();
    mockedLoginUser.mockResolvedValue({
      accessToken: 'jwt.token.value',
      expiresIn: 3600,
      userId: 'u1',
      email: 'jane@example.com',
      fullName: 'Jane Doe',
    });
    const { store, onClose } = renderModal('login');

    await user.type(screen.getByLabelText(/^email/i), 'jane@example.com');
    await user.type(screen.getByLabelText(/^password/i), 'hunter22');
    await user.click(screen.getByRole('button', { name: /^log in$/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(store.getState().auth).toMatchObject({ status: 'authenticated', token: 'jwt.token.value', email: 'jane@example.com' });
  });

  it('on failed login (401), shows a generic error and does not dispatch loggedIn', async () => {
    const user = userEvent.setup();
    mockedLoginUser.mockRejectedValue(new BackendApiError('Invalid credentials', 401));
    const { store, onClose } = renderModal('login');

    await user.type(screen.getByLabelText(/^email/i), 'jane@example.com');
    await user.type(screen.getByLabelText(/^password/i), 'wrongpass');
    await user.click(screen.getByRole('button', { name: /^log in$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid credentials');
    expect(onClose).not.toHaveBeenCalled();
    expect(store.getState().auth.status).toBe('anonymous');
  });

  it('on successful registration, switches to login with an info message and prefilled email', async () => {
    const user = userEvent.setup();
    mockedRegisterUser.mockResolvedValue({ userId: 'u1' });
    const { onClose } = renderModal('register');

    await user.type(screen.getByLabelText(/full name/i), 'Jane Doe');
    await user.type(screen.getByLabelText(/^email/i), 'jane@example.com');
    await user.type(screen.getByLabelText(/^password/i), 'hunter22');
    await user.type(screen.getByLabelText(/confirm password/i), 'hunter22');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText(/account created/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^email/i)).toHaveValue('jane@example.com');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('on failed registration (409 duplicate email), shows the backend error and stays on register', async () => {
    const user = userEvent.setup();
    mockedRegisterUser.mockRejectedValue(new BackendApiError('Email already registered', 409));
    renderModal('register');

    await user.type(screen.getByLabelText(/full name/i), 'Jane Doe');
    await user.type(screen.getByLabelText(/^email/i), 'jane@example.com');
    await user.type(screen.getByLabelText(/^password/i), 'hunter22');
    await user.type(screen.getByLabelText(/confirm password/i), 'hunter22');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Email already registered');
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal('login');

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalled();
  });
});
