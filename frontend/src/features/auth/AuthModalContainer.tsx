import { useEffect, useState } from 'react';
import { useAppDispatch } from '../../app/hooks';
import { Modal } from '../../shared/ui/Modal';
import { RegisterForm, type RegisterFormSubmitValues } from './RegisterForm';
import { LoginForm, type LoginFormSubmitValues } from './LoginForm';
import { loggedIn } from './authSlice';
import { loginUser, registerUser } from '../../api/backendClient';
import { BackendApiError } from '../../api/types';

const REGISTER_TITLE_ID = 'auth-modal-register-title';
const LOGIN_TITLE_ID = 'auth-modal-login-title';

type AuthView = 'login' | 'register';
type SubmitStatus = 'idle' | 'submitting';

export interface AuthModalContainerProps {
  view: AuthView;
  onClose: () => void;
}

/**
 * Owns the register <-> login switching and the actual API calls for the
 * optional-auth flow. Deliberately separate from `checkoutSlice` — nothing
 * here ever touches `CheckoutState`/`CheckoutStep`. Registration never logs
 * the buyer in automatically (the backend's register response carries no
 * token, per spec) — success hands off to the login view instead, with the
 * email prefilled and a confirmation message shown.
 */
export function AuthModalContainer({ view, onClose }: AuthModalContainerProps) {
  const dispatch = useAppDispatch();
  const [currentView, setCurrentView] = useState<AuthView>(view);
  const [status, setStatus] = useState<SubmitStatus>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [prefillEmail, setPrefillEmail] = useState<string | undefined>(undefined);

  // Re-syncs whenever the header menu re-opens the modal with a different
  // requested view (e.g. closing a "Log in" modal and immediately opening
  // "Register" from the header) — a fresh open should never keep stale
  // errors/info from a previous session.
  useEffect(() => {
    setCurrentView(view);
    setSubmitError(null);
    setInfoMessage(null);
  }, [view]);

  function handleClose() {
    if (status === 'submitting') {
      return;
    }
    onClose();
  }

  async function handleRegisterSubmit(values: RegisterFormSubmitValues) {
    setStatus('submitting');
    setSubmitError(null);
    try {
      await registerUser(values);
      setPrefillEmail(values.email);
      setInfoMessage('Account created — log in to continue');
      setCurrentView('login');
    } catch (error) {
      setSubmitError(error instanceof BackendApiError ? error.message : 'Registration failed');
    } finally {
      setStatus('idle');
    }
  }

  async function handleLoginSubmit(values: LoginFormSubmitValues) {
    setStatus('submitting');
    setSubmitError(null);
    try {
      const result = await loginUser(values);
      dispatch(
        loggedIn({
          token: result.accessToken,
          userId: result.userId,
          email: result.email,
          fullName: result.fullName,
        }),
      );
      onClose();
    } catch (error) {
      setSubmitError(error instanceof BackendApiError ? error.message : 'Login failed');
      setStatus('idle');
    }
  }

  function handleSwitchToLogin() {
    setSubmitError(null);
    setInfoMessage(null);
    setCurrentView('login');
  }

  function handleSwitchToRegister() {
    setSubmitError(null);
    setInfoMessage(null);
    setCurrentView('register');
  }

  if (currentView === 'register') {
    return (
      <Modal titleId={REGISTER_TITLE_ID} title="Create account" onClose={handleClose}>
        <RegisterForm
          isSubmitting={status === 'submitting'}
          submitError={submitError}
          onSubmit={handleRegisterSubmit}
          onSwitchToLogin={handleSwitchToLogin}
        />
      </Modal>
    );
  }

  return (
    <Modal titleId={LOGIN_TITLE_ID} title="Log in" onClose={handleClose}>
      <LoginForm
        isSubmitting={status === 'submitting'}
        submitError={submitError}
        infoMessage={infoMessage}
        initialEmail={prefillEmail}
        onSubmit={handleLoginSubmit}
        onSwitchToRegister={handleSwitchToRegister}
      />
    </Modal>
  );
}
