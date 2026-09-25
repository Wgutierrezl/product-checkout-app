import styles from './Spinner.module.css';

export interface SpinnerProps {
  label?: string;
}

/** An accessible loading indicator: visually a spinning ring, announced via `role="status"`. */
export function Spinner({ label = 'Loading' }: SpinnerProps) {
  return (
    <div className={styles.spinner} role="status">
      <span className={styles.ring} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
