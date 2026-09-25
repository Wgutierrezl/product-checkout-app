import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginForm } from './LoginForm';

function renderForm(overrides: Partial<React.ComponentProps<typeof LoginForm>> = {}) {
  const onSubmit = jest.fn();
  const onSwitchToRegister = jest.fn();
  const utils = render(
    <LoginForm
      isSubmitting={false}
      submitError={null}
      infoMessage={null}
      onSubmit={onSubmit}
      onSwitchToRegister={onSwitchToRegister}
      {...overrides}
    />,
  );
  return { ...utils, onSubmit, onSwitchToRegister };
}

describe('LoginForm', () => {
  it('renders email and password fields', () => {
    renderForm();

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it('submits email/password when both fields are valid', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.type(screen.getByLabelText(/email/i), 'jane@example.com');
    await user.type(screen.getByLabelText(/password/i), 'hunter22');
    await user.click(screen.getByRole('button', { name: /^log in$/i }));

    expect(onSubmit).toHaveBeenCalledWith({ email: 'jane@example.com', password: 'hunter22' });
  });

  it('shows an inline error and does not submit when a field is invalid, focusing it', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.type(screen.getByLabelText(/email/i), 'not-an-email');
    await user.type(screen.getByLabelText(/password/i), 'hunter22');
    await user.click(screen.getByRole('button', { name: /^log in$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/valid email/i);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/email/i)).toHaveFocus();
  });

  it('renders a generic error message on bad credentials without naming which field was wrong', () => {
    renderForm({ submitError: 'Invalid email or password' });

    expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password');
  });

  it('renders an info message (e.g. post-registration) above the form', () => {
    renderForm({ infoMessage: 'Account created — log in to continue' });

    expect(screen.getByText('Account created — log in to continue')).toBeInTheDocument();
  });

  it('disables the fieldset while isSubmitting', () => {
    renderForm({ isSubmitting: true });

    expect(screen.getByRole('button', { name: /logging in/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeDisabled();
  });

  it('calls onSwitchToRegister when the "create one" link is activated', async () => {
    const user = userEvent.setup();
    const { onSwitchToRegister } = renderForm();

    await user.click(screen.getByRole('button', { name: /create one/i }));

    expect(onSwitchToRegister).toHaveBeenCalled();
  });

  it('prefills the email field from initialEmail (e.g. right after registering)', () => {
    renderForm({ initialEmail: 'jane@example.com' });

    expect(screen.getByLabelText(/email/i)).toHaveValue('jane@example.com');
  });
});
