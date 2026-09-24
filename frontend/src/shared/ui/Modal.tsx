import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Backdrop } from './Backdrop';
import styles from './Modal.module.css';

export interface ModalProps {
  titleId: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

/**
 * An accessible modal dialog: renders via a portal (so it escapes any
 * `overflow: hidden`/`z-index` ancestor), traps Tab focus, closes on Escape
 * or backdrop click, and restores focus to whatever triggered it on
 * unmount. Bottom sheet on mobile, centered dialog from tablet up (see
 * Modal.module.css) — both purely visual, the a11y contract is identical.
 */
export function Modal({ titleId, title, onClose, children }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const container = dialogRef.current;
    const focusable = container ? getFocusableElements(container) : [];
    (focusable[0] ?? container)?.focus();

    return () => {
      previouslyFocused.current?.focus();
    };
  }, []);

  // Locks page scroll and hides the rest of the app from assistive tech
  // and pointer/keyboard interaction while the modal is open — this is a
  // real UI-blocking dialog, not an overlay the buyer can interact past.
  useEffect(() => {
    const originalBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const overlay = overlayRef.current;
    const siblings = overlay
      ? (Array.from(document.body.children).filter((el) => el !== overlay) as HTMLElement[])
      : [];
    const previousSiblingState = siblings.map((el) => ({
      el,
      ariaHidden: el.getAttribute('aria-hidden'),
      hadInert: el.hasAttribute('inert'),
    }));

    siblings.forEach((el) => {
      el.setAttribute('aria-hidden', 'true');
      el.setAttribute('inert', '');
    });

    return () => {
      document.body.style.overflow = originalBodyOverflow;
      previousSiblingState.forEach(({ el, ariaHidden, hadInert }) => {
        if (ariaHidden === null) {
          el.removeAttribute('aria-hidden');
        } else {
          el.setAttribute('aria-hidden', ariaHidden);
        }
        if (!hadInert) {
          el.removeAttribute('inert');
        }
      });
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !dialogRef.current) {
        return;
      }

      const focusable = getFocusableElements(dialogRef.current);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

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
