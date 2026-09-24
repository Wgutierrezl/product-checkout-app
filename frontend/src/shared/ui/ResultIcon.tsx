import styles from './ResultIcon.module.css';

export interface ResultIconProps {
  variant: 'approved' | 'failure';
}

/**
 * Small original inline SVG mark shown above the RESULT card's heading.
 * Purely decorative (`aria-hidden`) — the heading text right below it
 * ("Payment approved" / "Payment not completed") already announces the
 * outcome to assistive tech, so duplicating it here would only add noise.
 * The ring + mark stroke draws in on mount via `stroke-dashoffset`;
 * disabled entirely under `prefers-reduced-motion` (CSS media query, no
 * JS branching needed).
 */
export function ResultIcon({ variant }: ResultIconProps) {
  const isApproved = variant === 'approved';

  return (
    <svg
      className={`${styles.icon} ${isApproved ? styles.approved : styles.failure}`}
      viewBox="0 0 48 48"
      width={48}
      height={48}
      aria-hidden="true"
      data-testid="result-icon"
    >
      <circle className={styles.ring} cx="24" cy="24" r="21" fill="none" strokeWidth={3} />
      {isApproved ? (
        <path
          className={styles.mark}
          d="M14 25l6.5 6.5L34 17"
          fill="none"
          strokeWidth={3.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          data-testid="result-icon-check"
        />
      ) : (
        <path
          className={styles.mark}
          d="M17 17l14 14M31 17l-14 14"
          fill="none"
          strokeWidth={3.5}
          strokeLinecap="round"
          data-testid="result-icon-cross"
        />
      )}
    </svg>
  );
}
