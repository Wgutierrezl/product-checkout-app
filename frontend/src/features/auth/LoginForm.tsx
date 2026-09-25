import { useRef, useState, type FormEvent } from 'react';
import { Field } from '../../shared/ui/Field';
import { Button } from '../../shared/ui/Button';
import { requireNonEmpty, validateEmail } from '../../domain/checkout/customerDeliveryValidation';
import styles from './AuthForm.module.css';

const FIELD_NAMES = ['email', 'password'] as const;
type FieldName = (typeof FIELD_NAMES)[number];

interface FormValues {
  email: string;
  password: string;
}

export interface LoginFormSubmitValues {
  email: string;
  password: string;
}

export interface LoginFormProps {
  isSubmitting: boolean;
  submitError: string | null;
  /** e.g. "Account created — log in to continue" after a successful registration. */
  infoMessage: string | null;
  onSubmit: (values: LoginFormSubmitValues) => void;
  onSwitchToRegister: () => void;
}

const VALIDATORS: Record<FieldName, (v: FormValues) => string | null> = {
  email: (v) => validateEmail(v.email),
  password: (v) => requireNonEmpty(v.password, 'Password is required'),
};

/**
 * Deliberately generic `submitError` copy at the CALLER (never derived
 * here): a login form must never hint whether the email or the password
 * was the wrong one — see spec Requirement "User Login" (bad-credentials
 * scenario).
 */
export function LoginForm({ isSubmitting, submitError, infoMessage, onSubmit, onSwitchToRegister }: LoginFormProps) {
  const [values, setValues] = useState<FormValues>({ email: '', password: '' });
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const fieldRefs = useRef<Partial<Record<FieldName, HTMLInputElement>>>({});

  function setField<K extends keyof FormValues>(field: K, value: FormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function handleBlur(field: FieldName) {
    return () => {
      setErrors((current) => ({ ...current, [field]: VALIDATORS[field](values) ?? undefined }));
    };
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    const nextErrors: Partial<Record<FieldName, string>> = {};
    for (const field of FIELD_NAMES) {
      const message = VALIDATORS[field](values);
      if (message) {
        nextErrors[field] = message;
      }
    }
    setErrors(nextErrors);

    const firstInvalid = FIELD_NAMES.find((field) => nextErrors[field]);
    if (firstInvalid) {
      fieldRefs.current[firstInvalid]?.focus();
      return;
    }

    onSubmit({ email: values.email.trim(), password: values.password });
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      {infoMessage && <p className={styles.info}>{infoMessage}</p>}
      {submitError && (
        <p role="alert" className={styles.alert}>
          {submitError}
        </p>
      )}

      <fieldset className={styles.fieldset} disabled={isSubmitting}>
        <div className={styles.grid}>
          <Field id="loginEmail" label="Email" error={errors.email}>
            {(aria) => (
              <input
                {...aria}
                ref={(el) => {
                  fieldRefs.current.email = el ?? undefined;
                }}
                className={styles.input}
                type="email"
                autoComplete="email"
                value={values.email}
                onChange={(event) => setField('email', event.target.value)}
                onBlur={handleBlur('email')}
              />
            )}
          </Field>

          <Field id="loginPassword" label="Password" error={errors.password}>
            {(aria) => (
              <input
                {...aria}
                ref={(el) => {
                  fieldRefs.current.password = el ?? undefined;
                }}
                className={styles.input}
                type="password"
                autoComplete="current-password"
                value={values.password}
                onChange={(event) => setField('password', event.target.value)}
                onBlur={handleBlur('password')}
              />
            )}
          </Field>
        </div>
      </fieldset>

      <div className={styles.actions}>
        <Button type="submit" disabled={isSubmitting} loading={isSubmitting} loadingLabel="Logging in…">
          Log in
        </Button>
      </div>

      <p className={styles.switch}>
        Don&rsquo;t have an account?{' '}
        <button type="button" className={styles.switchLink} onClick={onSwitchToRegister} disabled={isSubmitting}>
          Create one
        </button>
      </p>
    </form>
  );
}
