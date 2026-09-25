import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RegisterForm } from './RegisterForm';

function renderForm(overrides: Partial<React.ComponentProps<typeof RegisterForm>> = {}) {
  const onSubmit = jest.fn();
  const onSwitchToLogin = jest.fn();
  const utils = render(
    <RegisterForm
      isSubmitting={false}
      submitError={null}
      onSubmit={onSubmit}
      onSwitchToLogin={onSwitchToLogin}
      {...overrides}
    />,
  );
  return { ...utils, onSubmit, onSwitchToLogin };
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/full name/i), 'Jane Doe');
  await user.type(screen.getByLabelText(/^email/i), 'jane@example.com');
  await user.type(screen.getByLabelText(/^password/i), 'hunter22');
  await user.type(screen.getByLabelText(/confirm password/i), 'hunter22');
}

describe('RegisterForm', () => {
  it('renders full name, email, password and confirm password fields', () => {
    renderForm();

    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
  });

  it('submits fullName/email/password when every field is valid', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      fullName: 'Jane Doe',
      email: 'jane@example.com',
      password: 'hunter22',
    });
  });

  it('shows an inline error and does not submit when a field is invalid, focusing the first invalid field', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.type(screen.getByLabelText(/full name/i), 'Jane Doe');
    await user.type(screen.getByLabelText(/^email/i), 'not-an-email');
    await user.type(screen.getByLabelText(/^password/i), 'hunter22');
    await user.type(screen.getByLabelText(/confirm password/i), 'hunter22');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/valid email/i);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/^email/i)).toHaveFocus();
  });

  it('shows a mismatch error when password confirmation does not match', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.type(screen.getByLabelText(/full name/i), 'Jane Doe');
    await user.type(screen.getByLabelText(/^email/i), 'jane@example.com');
    await user.type(screen.getByLabelText(/^password/i), 'hunter22');
    await user.type(screen.getByLabelText(/confirm password/i), 'different');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/do not match/i);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('renders the top-level submitError as an alert', () => {
    renderForm({ submitError: 'Email already registered' });

    expect(screen.getByRole('alert')).toHaveTextContent('Email already registered');
  });

  it('disables the form fieldset while isSubmitting', () => {
    renderForm({ isSubmitting: true });

    expect(screen.getByRole('button', { name: /creating account/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/full name/i)).toBeDisabled();
  });

  it('calls onSwitchToLogin when the "log in" link is activated', async () => {
    const user = userEvent.setup();
    const { onSwitchToLogin } = renderForm();

    await user.click(screen.getByRole('button', { name: /log in/i }));

    expect(onSwitchToLogin).toHaveBeenCalled();
  });
});
