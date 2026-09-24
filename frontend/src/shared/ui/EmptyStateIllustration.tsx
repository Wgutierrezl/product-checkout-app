import styles from './EmptyStateIllustration.module.css';

/**
 * Original inline SVG (an open, empty crate) shown above the "no products
 * available" message. Purely decorative — the message itself already
 * carries the meaning for assistive tech.
 */
export function EmptyStateIllustration() {
  return (
    <svg
      className={styles.illustration}
      viewBox="0 0 96 72"
      width={96}
      height={72}
      aria-hidden="true"
      data-testid="empty-state-illustration"
    >
      <path className={styles.outline} d="M10 30 L48 16 L86 30 L86 60 L48 74 L10 60 Z" fill="none" strokeWidth={2.5} />
      <path className={styles.outline} d="M10 30 L48 44 L86 30" fill="none" strokeWidth={2.5} />
      <path className={styles.outline} d="M48 44 L48 74" fill="none" strokeWidth={2.5} />
      <path className={styles.dashed} d="M30 8 L48 16 L66 8" fill="none" strokeWidth={2} strokeDasharray="4 4" />
    </svg>
  );
}
