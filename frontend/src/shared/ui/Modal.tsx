import { useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Backdrop } from './Backdrop';
import { useOverlayA11y } from './useOverlayA11y';
import styles from './Modal.module.css';

export interface ModalProps {
  titleId: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * An accessible modal dialog: renders via a portal (so it escapes any
 * `overflow: hidden`/`z-index` ancestor), traps Tab focus, closes on Escape
 * or backdrop click, and restores focus to whatever triggered it on
 * unmount (see `useOverlayA11y`, shared with the SUMMARY step's backdrop).
 * Bottom sheet on mobile, centered dialog from tablet up (see
 * Modal.module.css) — both purely visual, the a11y contract is identical.
 */
export function Modal({ titleId, title, onClose, children }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useOverlayA11y({ overlayRef, containerRef: dialogRef, onClose });

  return createPortal(
    <div className={styles.overlay} ref={overlayRef}>
      <Backdrop onClick={onClose} />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className={styles.sheet} tabIndex={-1}>
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}
