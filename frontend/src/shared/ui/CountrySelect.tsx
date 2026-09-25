import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { COUNTRIES, findCountryByIso2, flagEmoji, type Country } from '../../domain/phone/countries';
import styles from './CountrySelect.module.css';

export interface CountrySelectProps {
  id: string;
  /** ISO2 code of the currently selected country. */
  value: string;
  onChange: (iso2: string) => void;
  label?: string;
}

function displayLabel(country: Country): string {
  return `${flagEmoji(country.iso2)} +${country.dialCode}`;
}

function optionId(id: string, iso2: string): string {
  return `${id}-option-${iso2}`;
}

function matchesQuery(country: Country, query: string): boolean {
  const normalized = query.trim().toLowerCase().replace(/^\+/, '');
  if (normalized.length === 0) {
    return true;
  }
  return (
    country.name.toLowerCase().includes(normalized) ||
    country.dialCode.startsWith(normalized) ||
    country.iso2.toLowerCase().startsWith(normalized)
  );
}

/**
 * An accessible country picker for a phone number's dial code: the WAI-ARIA
 * "combobox with list autocomplete" pattern — a single text input (typing
 * filters by country name, ISO2 code, or dial code) paired with a
 * `role="listbox"` popup, navigated with Arrow keys / Enter / Escape and
 * wired via `aria-expanded`/`aria-controls`/`aria-activedescendant` rather
 * than moving DOM focus off the input.
 */
export function CountrySelect({ id, value, onChange, label = 'Country code' }: CountrySelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = findCountryByIso2(value) ?? COUNTRIES[0];
  const filtered = useMemo(() => COUNTRIES.filter((country) => matchesQuery(country, query)), [query]);
  const listboxId = `${id}-listbox`;

  function openList() {
    setOpen(true);
    setActiveIndex(0);
  }

  function closeList() {
    setOpen(false);
    setQuery('');
    setActiveIndex(0);
  }

  function selectCountry(country: Country) {
    onChange(country.iso2);
    closeList();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) {
        openList();
        return;
      }
      setActiveIndex((current) => (filtered.length === 0 ? 0 : (current + 1) % filtered.length));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        openList();
        return;
      }
      setActiveIndex((current) => (filtered.length === 0 ? 0 : (current - 1 + filtered.length) % filtered.length));
      return;
    }
    if (event.key === 'Enter') {
      if (open && filtered[activeIndex]) {
        event.preventDefault();
        selectCountry(filtered[activeIndex]);
      }
      return;
    }
    if (event.key === 'Escape') {
      if (open) {
        event.preventDefault();
        closeList();
      }
      return;
    }
    if (event.key === 'Tab') {
      closeList();
    }
  }

  const activeOption = open ? filtered[activeIndex] : undefined;

  return (
    <div className={styles.wrapper}>
      <input
        ref={inputRef}
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={activeOption ? optionId(id, activeOption.iso2) : undefined}
        aria-label={label}
        className={styles.trigger}
        autoComplete="off"
        value={open ? query : displayLabel(selected)}
        onFocus={openList}
        onClick={openList}
        onChange={(event) => {
          // `onFocus`/`onClick` already open the list before the input can
          // ever receive a change event, so `open` is always true here.
          setQuery(event.target.value);
          setActiveIndex(0);
        }}
        onKeyDown={handleKeyDown}
        onBlur={(event) => {
          // Ignore the blur caused by clicking an option — mousedown on the
          // option already handled the selection with preventDefault, so by
          // the time blur fires there's nothing left to close/reset.
          if (event.relatedTarget && event.currentTarget.parentElement?.contains(event.relatedTarget as Node)) {
            return;
          }
          closeList();
        }}
      />
      {open && (
        <ul role="listbox" id={listboxId} aria-label={label} className={styles.listbox}>
          {filtered.length === 0 && <li className={styles.empty}>No matching country</li>}
          {filtered.map((country, index) => (
            <li
              key={country.iso2}
              id={optionId(id, country.iso2)}
              role="option"
              aria-selected={country.iso2 === value}
              className={index === activeIndex ? styles.optionActive : styles.option}
              onMouseDown={(event) => {
                event.preventDefault();
                selectCountry(country);
              }}
            >
              <span aria-hidden="true">{flagEmoji(country.iso2)}</span> {country.name} (+{country.dialCode})
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
