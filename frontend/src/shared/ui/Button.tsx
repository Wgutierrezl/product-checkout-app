import type { ButtonHTMLAttributes } from 'react';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

/** The single button primitive used across the app — primary (CTA) or secondary (low-emphasis). */
export function Button({ variant = 'primary', className, type = 'button', ...rest }: ButtonProps) {
  const variantClass = variant === 'primary' ? styles.primary : styles.secondary;

  return (
    <button
      type={type}
      data-variant={variant}
      className={[styles.button, variantClass, className].filter(Boolean).join(' ')}
      {...rest}
    />
  );
}
