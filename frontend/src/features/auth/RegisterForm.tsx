import { useRef, useState, type FormEvent } from 'react';
import { Field } from '../../shared/ui/Field';
import { Button } from '../../shared/ui/Button';
import { validateEmail, validateFullName } from '../../domain/checkout/customerDeliveryValidation';
import { validatePassword, validatePasswordConfirmation } from '../../domain/auth/passwordValidation';
import styles from './AuthForm.module.css';

const FIELD_NAMES = ['fullName', 'email', 'password', 'confirmPassword'] as const;
type FieldName = (typeof FIELD_NAMES)[number];

interface FormValues {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export interface RegisterFormSubmitValues {
  fullName: string;
  email: string;
  password: string;
}

export interface RegisterFormProps {
  isSubmitting: boolean;
  submitError: string | null;
  onSubmit: (values: RegisterFormSubmitValues) => void;
  onSwitchToLogin: () => void;
}

/**
 * Account creation form. Validation runs on blur (inline) and again on
 * submit, which also focuses the first invalid field — same UX contract as
 * `PaymentForm`. Password fields are real `type="password"` (unlike the
 * card CVC, which deliberately avoids it) so browser password managers can
 * offer to save/generate a credential here.
 */
export function RegisterForm({ isSubmitting, submitError, onSubmit, onSwitchToLogin }: RegisterFormProps) {
  const [values, setValues] = useState<FormValues>({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const fieldRefs = useRef<Partial<Record<FieldName, HTMLInputElement>>>({});

  const VALIDATORS: Record<FieldName, (v: FormValues) => string | null> = {
    fullName: (v) => validateFullName(v.fullName),
    email: (v) => validateEmail(v.email),
    password: (v) => validatePassword(v.password),
    confirmPassword: (v) => validatePasswordConfirmation(v.confirmPassword, v.password),
  };

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

    onSubmit({
      fullName: values.fullName.trim(),
      email: values.email.trim(),
      password: values.password,
    });
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      {submitError && (
        <p role="alert" className={styles.alert}>
          {submitError}
        </p>
      )}

      <fieldset className={styles.fieldset} disabled={isSubmitting}>
        <div className={styles.grid}>
          <Field id="registerFullName" label="Full name" error={errors.fullName}>
            {(aria) => (
              <input
                {...aria}
                ref={(el) => {
                  fieldRefs.current.fullName = el ?? undefined;
                }}
                className={styles.input}
                autoComplete="name"
                value={values.fullName}
                onChange={(event) => setField('fullName', event.target.value)}
                onBlur={handleBlur('fullName')}
              />
            )}
          </Field>

          <Field id="registerEmail" label="Email" error={errors.email}>
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

          <Field id="registerPassword" label="Password" hint="At least 8 characters" error={errors.password}>
            {(aria) => (
              <input
                {...aria}
                ref={(el) => {
                  fieldRefs.current.password = el ?? undefined;
                }}
                className={styles.input}
                type="password"
                autoComplete="new-password"
                value={values.password}
                onChange={(event) => setField('password', event.target.value)}
                onBlur={handleBlur('password')}
              />
            )}
          </Field>

          <Field id="registerConfirmPassword" label="Confirm password" error={errors.confirmPassword}>
            {(aria) => (
              <input
                {...aria}
                ref={(el) => {
                  fieldRefs.current.confirmPassword = el ?? undefined;
                }}
                className={styles.input}
                type="password"
                autoComplete="new-password"
                value={values.confirmPassword}
                onChange={(event) => setField('confirmPassword', event.target.value)}
                onBlur={handleBlur('confirmPassword')}
              />
            )}
          </Field>
        </div>
      </fieldset>

      <div className={styles.actions}>
        <Button type="submit" disabled={isSubmitting} loading={isSubmitting} loadingLabel="Creating account…">
          Create account
        </Button>
      </div>

      <p className={styles.switch}>
        Already have an account?{' '}
        <button type="button" className={styles.switchLink} onClick={onSwitchToLogin} disabled={isSubmitting}>
          Log in
        </button>
      </p>
    </form>
  );
}
