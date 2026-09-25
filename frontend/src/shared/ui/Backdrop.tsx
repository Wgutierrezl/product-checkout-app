import styles from './Backdrop.module.css';

export interface BackdropProps {
  onClick: () => void;
}

/** The dimmed layer behind a modal; decorative only (the dialog itself carries the a11y semantics). */
export function Backdrop({ onClick }: BackdropProps) {
  return <div className={styles.backdrop} onClick={onClick} aria-hidden="true" data-testid="backdrop" />;
}
