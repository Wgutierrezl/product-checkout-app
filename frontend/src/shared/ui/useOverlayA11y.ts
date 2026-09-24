import { useEffect, type RefObject } from 'react';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

export interface UseOverlayA11yOptions {
  /** The element rendered as a full-viewport overlay — its DIRECT SIBLINGS are hidden from assistive tech/pointer/keyboard while mounted. */
  overlayRef: RefObject<HTMLElement | null>;
  /** Tab focus is trapped within this element. */
  containerRef: RefObject<HTMLElement | null>;
  /** Called when Escape is pressed. */
  onClose: () => void;
  /** Focused first if given (e.g. a heading, so screen readers announce the title before any control); otherwise the first focusable element inside `containerRef`, or the container itself. */
  initialFocusRef?: RefObject<HTMLElement | null>;
}

/**
 * Shared a11y behavior for a full-viewport, focus-trapped overlay — used by
 * both `Modal` (a floating dialog) and the checkout SUMMARY step (a
 * full-screen backdrop with its own visual chrome, see `Summary.tsx`).
 * Traps Tab focus, closes on Escape, hides the rest of the app from
 * assistive tech and pointer/keyboard interaction (`aria-hidden` + `inert`
 * on every OTHER direct child of `document.body`) and locks page scroll
 * while mounted, and restores focus to whatever triggered it on unmount.
 */
export function useOverlayA11y({ overlayRef, containerRef, onClose, initialFocusRef }: UseOverlayA11yOptions): void {
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const container = containerRef.current;
    const focusable = container ? getFocusableElements(container) : [];
    (initialFocusRef?.current ?? focusable[0] ?? container)?.focus();

    return () => {
      previouslyFocused?.focus();
    };
    // Refs are stable across renders; this effect intentionally runs once on mount/unmount only.
  }, [containerRef, initialFocusRef]);

  // Locks page scroll and hides the rest of the app from assistive tech and
  // pointer/keyboard interaction while mounted — a real UI-blocking overlay,
  // not something the buyer can interact past.
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
  }, [overlayRef]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !containerRef.current) {
        return;
      }

      const focusable = getFocusableElements(containerRef.current);
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
  }, [onClose, containerRef]);
}
