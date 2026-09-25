import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /**
   * True while the async action this button triggers (tokenizing, paying,
   * ...) is in flight. Swaps the accessible name to `loadingLabel`, sets
   * `aria-busy`, and keeps the button's normal full-colour styling instead
   * of the washed-out `:disabled` look (the button is almost always ALSO
   * passed `disabled` while loading, to block a double-submit — this flag
   * is what tells a loading `disabled` button apart from a plain one).
   */
  loading?: boolean;
  /**
   * The label (and an in-button spinner) shown while `loading` is true.
   * Its mere presence — even with `loading` still false — reserves the
   * button's width for whichever of the two labels is wider, so entering
   * the loading state never resizes the button.
   */
  loadingLabel?: ReactNode;
}

/** The single button primitive used across the app — primary (CTA) or secondary (low-emphasis). */
export function Button({
  variant = 'primary',
  className,
  type = 'button',
  loading = false,
  loadingLabel,
  children,
  ...rest
}: ButtonProps) {
  const variantClass = variant === 'primary' ? styles.primary : styles.secondary;
  const hasLoadingSlot = loadingLabel !== undefined;

  return (
    <button
      type={type}
      data-variant={variant}
      aria-busy={loading || undefined}
      className={[styles.button, variantClass, hasLoadingSlot && styles.stack, loading && styles.loading, className]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {hasLoadingSlot ? (
        <>
          {/* Both slots always render once `loadingLabel` is provided (even
              while idle) — CSS Grid stacks them in the same cell so the
              button's width is reserved for the wider label from the
              start, and `visibility: hidden` (not `display: none`) removes
              the inactive one from the accessible name without dropping
              its contribution to that width. */}
          <span className={`${styles.slot} ${loading ? styles.slotHidden : ''}`} aria-hidden={loading || undefined}>
            {children}
          </span>
          <span
            className={`${styles.slot} ${loading ? '' : styles.slotHidden}`}
            aria-hidden={loading ? undefined : true}
          >
            <span className={styles.spinnerRing} aria-hidden="true" />
            {loadingLabel}
          </span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
