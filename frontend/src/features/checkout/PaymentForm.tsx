import { useEffect, useRef, useState, type FormEvent } from 'react';
import { getEnv } from '../../config/env';
import { Field } from '../../shared/ui/Field';
import { Button } from '../../shared/ui/Button';
import { CardBrandIcon } from '../../shared/ui/CardBrandIcon';
import { CountrySelect } from '../../shared/ui/CountrySelect';
import { SandboxTestCardsHelper } from './SandboxTestCardsHelper';
import { isValidLuhn } from '../../domain/card/luhn';
import { detectCardBrand } from '../../domain/card/brand';
import { isExpiryValid, parseExpiry } from '../../domain/card/expiry';
import { isValidCvc } from '../../domain/card/cvc';
import { digitsOnly, formatCardNumberInput, formatExpiryInput } from '../../domain/card/format';
import { DEFAULT_COUNTRY_ISO2, findCountryByDialCode, findCountryByIso2 } from '../../domain/phone/countries';
import { DEFAULT_DIAL_CODE, isValidE164Phone, parsePhone, toE164 } from '../../domain/phone/phone';
import {
  requireNonEmpty,
  validateAddress,
  validateCity,
  validateEmail,
  validateFullName,
  validateRegion,
} from '../../domain/checkout/customerDeliveryValidation';
import type { CustomerInput, DeliveryInput } from '../../api/types';
import styles from './PaymentForm.module.css';

const INSTALLMENT_OPTIONS = Array.from({ length: 36 }, (_, index) => index + 1);

const FIELD_NAMES = [
  'cardNumber',
  'cardHolder',
  'expiry',
  'cvc',
  'fullName',
  'email',
  'phone',
  'address',
  'city',
  'region',
] as const;

type FieldName = (typeof FIELD_NAMES)[number];

interface FormValues {
  cardNumber: string;
  cardHolder: string;
  expiry: string;
  cvc: string;
  installments: number;
  fullName: string;
  email: string;
  /** ISO2 of the selected country (drives the E.164 dial code prefix). */
  phoneCountry: string;
  /** Digits-only national number, WITHOUT the country's dial code. */
  phoneNational: string;
  address: string;
  city: string;
  region: string;
  postalCode: string;
}

/** Both supported networks (Visa, Mastercard) issue exactly 16-digit PANs. */
const SUPPORTED_CARD_NUMBER_LENGTH = 16;

function validateCardNumber(value: string): string | null {
  const digits = digitsOnly(value);
  if (digits.length === 0) {
    return 'Card number is required';
  }
  if (!isValidLuhn(digits)) {
    return 'Invalid card number';
  }
  if (detectCardBrand(digits) === 'unknown') {
    return 'Unsupported card brand';
  }
  if (digits.length !== SUPPORTED_CARD_NUMBER_LENGTH) {
    return 'Card number must be 16 digits';
  }
  return null;
}

function validateExpiry(value: string): string | null {
  const parsed = parseExpiry(value);
  if (!parsed) {
    return 'Enter a valid expiry date (MM/YY)';
  }
  return isExpiryValid(parsed.month, parsed.year) ? null : 'Card is expired';
}

function validateCvc(value: string): string | null {
  return isValidCvc(value) ? null : 'Enter a valid 3-digit CVC';
}

/** The dial code (no leading "+") for a country selector's ISO2 value, falling back to the default country. */
function dialCodeForCountry(iso2: string): string {
  return findCountryByIso2(iso2)?.dialCode ?? DEFAULT_DIAL_CODE;
}

/**
 * Validates the NATIONAL number against the E.164 value it would produce
 * once combined with the selected country's dial code — the field the
 * buyer edits only ever holds digits, so its own length bounds depend on
 * which country is selected.
 */
function validatePhoneField(nationalNumber: string, countryIso2: string): string | null {
  const required = requireNonEmpty(nationalNumber, 'Phone is required');
  if (required) {
    return required;
  }
  return isValidE164Phone(toE164(dialCodeForCountry(countryIso2), nationalNumber))
    ? null
    : 'Enter a valid phone number';
}

/**
 * Every validator takes the FULL `FormValues` (rather than just its own
 * field's value) so `phone` can read both `phoneNational` and
 * `phoneCountry` without a special case in the submit/blur call sites.
 */
const VALIDATORS: Record<FieldName, (values: FormValues) => string | null> = {
  cardNumber: (values) => validateCardNumber(values.cardNumber),
  cardHolder: (values) => requireNonEmpty(values.cardHolder, 'Cardholder name is required'),
  expiry: (values) => validateExpiry(values.expiry),
  cvc: (values) => validateCvc(values.cvc),
  fullName: (values) => validateFullName(values.fullName),
  email: (values) => validateEmail(values.email),
  phone: (values) => validatePhoneField(values.phoneNational, values.phoneCountry),
  address: (values) => validateAddress(values.address),
  city: (values) => validateCity(values.city),
  region: (values) => validateRegion(values.region),
};

export interface PaymentFormSubmitValues {
  cardNumber: string;
  cardHolder: string;
  expMonth: number;
  expYear: number;
  cvc: string;
  installments: number;
  customer: CustomerInput;
  delivery: DeliveryInput;
}

export interface PaymentFormProps {
  initialCustomer: CustomerInput | null;
  initialDelivery: DeliveryInput | null;
  initialInstallments: number;
  isSubmitting: boolean;
  submitError: string | null;
  onCancel: () => void;
  onSubmit: (values: PaymentFormSubmitValues) => void;
}

/**
 * Card + customer + delivery form for the DETAILS step. Card fields
 * (`cardNumber`/`cvc`/etc.) NEVER prefill from anything persisted — only
 * customer/delivery do, sourced from the checkout slice for refresh
 * resilience. Validation runs on blur (inline) and again on submit (which
 * also focuses the first invalid field).
 */
export function PaymentForm({
  initialCustomer,
  initialDelivery,
  initialInstallments,
  isSubmitting,
  submitError,
  onCancel,
  onSubmit,
}: PaymentFormProps) {
  const [values, setValues] = useState<FormValues>(() => {
    // Gracefully migrates an existing plain/bare phone (persisted before
    // this country selector existed) by treating it as a Colombian
    // national number — see `parsePhone`.
    const initialPhone = parsePhone(initialCustomer?.phone ?? '');
    return {
      cardNumber: '',
      cardHolder: '',
      expiry: '',
      cvc: '',
      installments: initialInstallments,
      fullName: initialCustomer?.fullName ?? '',
      email: initialCustomer?.email ?? '',
      // NOTE: dial codes shared by several countries (e.g. "1" for the US,
      // Canada, and a few Caribbean nations — see `findCountryByDialCode`)
      // always resolve back to the same one; a persisted Canadian number,
      // for example, would reopen showing "United States". The phone VALUE
      // sent to the backend is unaffected — only which flag/name the
      // selector shows can be wrong. Full disambiguation would need
      // NANP-area-code-level data, out of scope for this hand-written list.
      phoneCountry: findCountryByDialCode(initialPhone.dialCode)?.iso2 ?? DEFAULT_COUNTRY_ISO2,
      phoneNational: initialPhone.nationalNumber,
      address: initialDelivery?.address ?? '',
      city: initialDelivery?.city ?? '',
      region: initialDelivery?.region ?? '',
      postalCode: initialDelivery?.postalCode ?? '',
    };
  });
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const fieldRefs = useRef<Partial<Record<FieldName, HTMLInputElement>>>({});

  // A failed tokenize attempt means the card was rejected (or the request
  // failed) — the buyer must re-enter card details from scratch rather
  // than resubmit the same (now-suspect, or simply stale) PAN/CVC/expiry.
  // Customer/delivery are untouched since they were valid regardless.
  useEffect(() => {
    if (submitError) {
      setValues((current) => ({ ...current, cardNumber: '', cardHolder: '', expiry: '', cvc: '' }));
    }
  }, [submitError]);

  const cardDigits = digitsOnly(values.cardNumber);
  const brand = detectCardBrand(cardDigits);
  const showUnsupportedBrandMessage = cardDigits.length >= 6 && brand === 'unknown';
  const { isSandbox } = getEnv();

  function setField<K extends keyof FormValues>(field: K, value: FormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  /**
   * Fills the card number field with one of the sandbox's two accepted
   * test PANs (formatted, same as manual typing), clears any stale
   * cardNumber validation error, and moves focus to the cardholder field
   * so the buyer can keep going without reaching for the mouse.
   */
  function handleUseTestCard(cardNumber: string) {
    setField('cardNumber', formatCardNumberInput(cardNumber));
    setErrors((current) => ({ ...current, cardNumber: undefined }));
    fieldRefs.current.cardHolder?.focus();
  }

  /**
   * The phone field's validity depends on BOTH `phoneNational` and
   * `phoneCountry` (a national number can be too short for one country and
   * fine for another) — if the phone was already touched (has a visible
   * error from a previous blur), switching countries must re-check it
   * immediately rather than leaving a now-stale error/pass on screen until
   * the national field is blurred again.
   */
  function handlePhoneCountryChange(iso2: string) {
    setValues((current) => ({ ...current, phoneCountry: iso2 }));
    setErrors((current) =>
      current.phone === undefined
        ? current
        : { ...current, phone: validatePhoneField(values.phoneNational, iso2) ?? undefined },
    );
  }

  function handleBlur(field: FieldName) {
    return () => {
      setErrors((current) => ({ ...current, [field]: VALIDATORS[field](values) ?? undefined }));
    };
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    const nextErrors: Partial<Record<FieldName, string>> = {};
    for (const field of FIELD_NAMES) {
      const message = VALIDATORS[field](values);
      if (message) {
        nextErrors[field] = message;
      }
    }
    setErrors(nextErrors);

    const firstInvalid = FIELD_NAMES.find((field) => nextErrors[field]);
    if (firstInvalid) {
      fieldRefs.current[firstInvalid]?.focus();
      return;
    }

    const parsedExpiry = parseExpiry(values.expiry);
    if (!parsedExpiry) {
      return;
    }

    const delivery: DeliveryInput = {
      address: values.address.trim(),
      city: values.city.trim(),
      region: values.region.trim(),
      ...(values.postalCode.trim() ? { postalCode: values.postalCode.trim() } : {}),
    };

    onSubmit({
      cardNumber: cardDigits,
      cardHolder: values.cardHolder.trim(),
      expMonth: parsedExpiry.month,
      expYear: parsedExpiry.year,
      cvc: values.cvc,
      installments: values.installments,
      customer: {
        fullName: values.fullName.trim(),
        email: values.email.trim(),
        phone: toE164(dialCodeForCountry(values.phoneCountry), values.phoneNational),
      },
      delivery,
    });
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      {submitError && (
        <p role="alert" className={styles.alert}>
          {submitError}
        </p>
      )}

      {/* `disabled` on a <fieldset> propagates to every descendant form
          control (inputs, the installments <select>, and CountrySelect's
          own combobox input), giving a native "fieldset disabled" visual +
          functional lock on the whole form while a request is in flight —
          without having to thread `disabled` through every single field. */}
      <fieldset className={styles.fieldset} disabled={isSubmitting}>
      <section>
        <h3 className={styles.sectionTitle}>Card</h3>
        <div className={styles.grid}>
          <Field id="cardNumber" label="Card number" error={errors.cardNumber}>
            {(aria) => (
              <div className={styles.cardNumberRow}>
                <input
                  {...aria}
                  ref={(el) => {
                    fieldRefs.current.cardNumber = el ?? undefined;
                  }}
                  className={styles.input}
                  inputMode="numeric"
                  autoComplete="cc-number"
                  value={values.cardNumber}
                  onChange={(event) => setField('cardNumber', formatCardNumberInput(event.target.value))}
                  onBlur={handleBlur('cardNumber')}
                />
                <CardBrandIcon brand={brand} />
              </div>
            )}
          </Field>
          {showUnsupportedBrandMessage && (
            <p className={styles.brandMessage}>Unsupported card brand — only Visa and Mastercard are accepted.</p>
          )}

          {isSandbox && <SandboxTestCardsHelper onUseCard={handleUseTestCard} />}

          <Field id="cardHolder" label="Cardholder name" error={errors.cardHolder}>
            {(aria) => (
              <input
                {...aria}
                ref={(el) => {
                  fieldRefs.current.cardHolder = el ?? undefined;
                }}
                className={styles.input}
                autoComplete="cc-name"
                value={values.cardHolder}
                onChange={(event) => setField('cardHolder', event.target.value)}
                onBlur={handleBlur('cardHolder')}
              />
            )}
          </Field>

          <div className={styles.gridTwo}>
            <Field id="expiry" label="Expiry (MM/YY)" error={errors.expiry}>
              {(aria) => (
                <input
                  {...aria}
                  ref={(el) => {
                    fieldRefs.current.expiry = el ?? undefined;
                  }}
                  className={styles.input}
                  placeholder="MM/YY"
                  inputMode="numeric"
                  autoComplete="cc-exp"
                  value={values.expiry}
                  onChange={(event) => setField('expiry', formatExpiryInput(event.target.value))}
                  onBlur={handleBlur('expiry')}
                />
              )}
            </Field>

            <Field id="cvc" label="CVC" error={errors.cvc}>
              {(aria) => (
                <input
                  {...aria}
                  ref={(el) => {
                    fieldRefs.current.cvc = el ?? undefined;
                  }}
                  className={styles.maskedInput}
                  type="text"
                  inputMode="numeric"
                  autoComplete="cc-csc"
                  maxLength={3}
                  value={values.cvc}
                  onChange={(event) => setField('cvc', digitsOnly(event.target.value).slice(0, 3))}
                  onBlur={handleBlur('cvc')}
                />
              )}
            </Field>
          </div>

          <Field id="installments" label="Installments">
            {(aria) => (
              <select
                {...aria}
                className={styles.input}
                value={values.installments}
                onChange={(event) => setField('installments', Number(event.target.value))}
              >
                {INSTALLMENT_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
      </section>

      <section>
        <h3 className={styles.sectionTitle}>Customer</h3>
        <div className={styles.grid}>
          <Field id="fullName" label="Full name" error={errors.fullName}>
            {(aria) => (
              <input
                {...aria}
                ref={(el) => {
                  fieldRefs.current.fullName = el ?? undefined;
                }}
                className={styles.input}
                autoComplete="name"
                value={values.fullName}
                onChange={(event) => setField('fullName', event.target.value)}
                onBlur={handleBlur('fullName')}
              />
            )}
          </Field>

          <Field id="email" label="Email" error={errors.email}>
            {(aria) => (
              <input
                {...aria}
                ref={(el) => {
                  fieldRefs.current.email = el ?? undefined;
                }}
                className={styles.input}
                type="email"
                autoComplete="email"
                value={values.email}
                onChange={(event) => setField('email', event.target.value)}
                onBlur={handleBlur('email')}
              />
            )}
          </Field>

          <Field id="phone" label="Phone" error={errors.phone}>
            {(aria) => (
              <div className={styles.phoneRow}>
                <div className={styles.phoneCountry}>
                  <CountrySelect
                    id="phoneCountry"
                    value={values.phoneCountry}
                    onChange={handlePhoneCountryChange}
                  />
                </div>
                <input
                  {...aria}
                  ref={(el) => {
                    fieldRefs.current.phone = el ?? undefined;
                  }}
                  className={styles.input}
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  value={values.phoneNational}
                  onChange={(event) => setField('phoneNational', digitsOnly(event.target.value))}
                  onBlur={handleBlur('phone')}
                />
              </div>
            )}
          </Field>
        </div>
      </section>

      <section>
        <h3 className={styles.sectionTitle}>Delivery</h3>
        <div className={styles.grid}>
          <Field id="address" label="Address" error={errors.address}>
            {(aria) => (
              <input
                {...aria}
                ref={(el) => {
                  fieldRefs.current.address = el ?? undefined;
                }}
                className={styles.input}
                autoComplete="street-address"
                value={values.address}
                onChange={(event) => setField('address', event.target.value)}
                onBlur={handleBlur('address')}
              />
            )}
          </Field>

          <Field id="city" label="City" error={errors.city}>
            {(aria) => (
              <input
                {...aria}
                ref={(el) => {
                  fieldRefs.current.city = el ?? undefined;
                }}
                className={styles.input}
                autoComplete="address-level2"
                value={values.city}
                onChange={(event) => setField('city', event.target.value)}
                onBlur={handleBlur('city')}
              />
            )}
          </Field>

          <Field id="region" label="Region" error={errors.region}>
            {(aria) => (
              <input
                {...aria}
                ref={(el) => {
                  fieldRefs.current.region = el ?? undefined;
                }}
                className={styles.input}
                autoComplete="address-level1"
                value={values.region}
                onChange={(event) => setField('region', event.target.value)}
                onBlur={handleBlur('region')}
              />
            )}
          </Field>

          <Field id="postalCode" label="Postal code (optional)">
            {(aria) => (
              <input
                {...aria}
                className={styles.input}
                autoComplete="postal-code"
                value={values.postalCode}
                onChange={(event) => setField('postalCode', event.target.value)}
              />
            )}
          </Field>
        </div>
      </section>
      </fieldset>

      <div className={styles.actions}>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting} loading={isSubmitting} loadingLabel="Securing your card…">
          Continue
        </Button>
      </div>
      {isSubmitting && (
        <p className={styles.statusLine} role="status">
          Securing your card — please don&rsquo;t close this window.
        </p>
      )}
    </form>
  );
}
