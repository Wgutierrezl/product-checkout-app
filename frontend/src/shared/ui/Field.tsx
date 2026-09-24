import type { ReactNode } from 'react';
import styles from './Field.module.css';

export interface FieldControlAria {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
}

export interface FieldProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: (aria: FieldControlAria) => ReactNode;
}

/**
 * Labels ANY form control (input, select, textarea, ...) passed via the
 * render-prop `children`, wiring `aria-describedby`/`aria-invalid`
 * automatically. An error replaces the hint (both visually and for
 * `aria-describedby`) rather than showing both at once.
 */
export function Field({ id, label, hint, error, children }: FieldProps) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      {children({
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
      })}
      {error ? (
        <p id={errorId} role="alert" className={styles.error}>
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
