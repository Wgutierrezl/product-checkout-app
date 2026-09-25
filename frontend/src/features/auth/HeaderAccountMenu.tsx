import { useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { loggedOut } from './authSlice';
import styles from './HeaderAccountMenu.module.css';

export type AuthView = 'login' | 'register';

export interface HeaderAccountMenuProps {
  onOpenAuth: (view: AuthView) => void;
}

const MENU_ID = 'header-account-menu';

/**
 * Auth-aware header menu (spec: "Header Account Menu"). Logged-out shows
 * plain Log in / Register triggers that hand off to `AuthModalContainer`
 * (owned by `App`, no router involved). Logged-in shows a single trigger
 * (the buyer's name) that opens a small `role="menu"` popover with Log
 * out — closes on Escape or on losing focus, mirroring the outside-click
 * handling already used by `CountrySelect`.
 */
export function HeaderAccountMenu({ onOpenAuth }: HeaderAccountMenuProps) {
  const dispatch = useAppDispatch();
  const auth = useAppSelector((state) => state.auth);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  function closeMenu() {
    setOpen(false);
  }

  function handleLogout() {
    dispatch(loggedOut());
    closeMenu();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
    }
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (event.relatedTarget && wrapperRef.current?.contains(event.relatedTarget as Node)) {
      return;
    }
    closeMenu();
  }

  if (auth.status !== 'authenticated') {
    return (
      <div className={styles.wrapper}>
        <button type="button" className={styles.linkButton} onClick={() => onOpenAuth('login')}>
          Log in
        </button>
        <button type="button" className={styles.primaryLink} onClick={() => onOpenAuth('register')}>
          Register
        </button>
      </div>
    );
  }

  const displayName = auth.fullName || auth.email || 'Account';

  return (
    <div className={styles.wrapper} ref={wrapperRef} onKeyDown={handleKeyDown} onBlur={handleBlur}>
      <button
        type="button"
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={MENU_ID}
        onClick={() => setOpen((current) => !current)}
      >
        {displayName}
        <span className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`} aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <ul id={MENU_ID} role="menu" aria-label="Account" className={styles.menu}>
          <li className={styles.menuHeader} role="presentation">
            {auth.email}
          </li>
          <li role="none">
            <button type="button" role="menuitem" className={styles.menuItem} onClick={handleLogout}>
              Log out
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
