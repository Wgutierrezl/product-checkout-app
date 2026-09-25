import styles from './ErrorStateIllustration.module.css';

/**
 * Original inline SVG (a plug pulled apart from its socket) shown above the
 * catalog fetch-error message — hints at a connection problem without
 * relying on a generic triangle-exclamation glyph. Purely decorative.
 */
export function ErrorStateIllustration() {
  return (
    <svg
      className={styles.illustration}
      viewBox="0 0 96 64"
      width={96}
      height={64}
      aria-hidden="true"
      data-testid="error-state-illustration"
    >
      <rect className={styles.socket} x="6" y="20" width="26" height="24" rx="4" fill="none" strokeWidth={2.5} />
      <path className={styles.prong} d="M14 20 L14 10" strokeWidth={2.5} strokeLinecap="round" />
      <path className={styles.prong} d="M24 20 L24 10" strokeWidth={2.5} strokeLinecap="round" />
      <path className={styles.cord} d="M52 32 L64 32" strokeWidth={2.5} strokeLinecap="round" strokeDasharray="1 7" />
      <circle className={styles.spark} cx="70" cy="32" r="4" fill="currentColor" stroke="none" />
      <path className={styles.plug} d="M70 20 h16 a4 4 0 0 1 4 4 v16 a4 4 0 0 1 -4 4 h-16 Z" fill="none" strokeWidth={2.5} />
    </svg>
  );
}
