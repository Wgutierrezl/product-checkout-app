import { useRef, useState, type FormEvent } from 'react';
import { Field } from '../../shared/ui/Field';
import { Button } from '../../shared/ui/Button';
import { CardBrandIcon } from '../../shared/ui/CardBrandIcon';
import { isValidLuhn } from '../../domain/card/luhn';
import { detectCardBrand } from '../../domain/card/brand';
import { isExpiryValid, parseExpiry } from '../../domain/card/expiry';
import { isValidCvc } from '../../domain/card/cvc';
import { digitsOnly, formatCardNumberInput } from '../../domain/card/format';
import {
  requireNonEmpty,
  validateAddress,
  validateCity,
  validateEmail,
  validateFullName,
  validatePhone,
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
  phone: string;
  address: string;
  city: string;
  region: string;
  postalCode: string;
}

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

const VALIDATORS: Record<FieldName, (value: string) => string | null> = {
  cardNumber: validateCardNumber,
  cardHolder: (value) => requireNonEmpty(value, 'Cardholder name is required'),
  expiry: validateExpiry,
  cvc: validateCvc,
  fullName: validateFullName,
  email: validateEmail,
  phone: validatePhone,
  address: validateAddress,
  city: validateCity,
  region: validateRegion,
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
  const [values, setValues] = useState<FormValues>({
    cardNumber: '',
    cardHolder: '',
    expiry: '',
    cvc: '',
    installments: initialInstallments,
    fullName: initialCustomer?.fullName ?? '',
    email: initialCustomer?.email ?? '',
    phone: initialCustomer?.phone ?? '',
    address: initialDelivery?.address ?? '',
    city: initialDelivery?.city ?? '',
    region: initialDelivery?.region ?? '',
    postalCode: initialDelivery?.postalCode ?? '',
  });
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const fieldRefs = useRef<Partial<Record<FieldName, HTMLInputElement>>>({});

  const cardDigits = digitsOnly(values.cardNumber);
  const brand = detectCardBrand(cardDigits);
  const showUnsupportedBrandMessage = cardDigits.length >= 6 && brand === 'unknown';

  function setField<K extends keyof FormValues>(field: K, value: FormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function handleBlur(field: FieldName) {
    return () => {
      setErrors((current) => ({ ...current, [field]: VALIDATORS[field](values[field]) ?? undefined }));
    };
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    const nextErrors: Partial<Record<FieldName, string>> = {};
    for (const field of FIELD_NAMES) {
      const message = VALIDATORS[field](values[field]);
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
        phone: values.phone.trim(),
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
                  autoComplete="cc-exp"
                  value={values.expiry}
                  onChange={(event) => setField('expiry', event.target.value)}
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
              <input
                {...aria}
                ref={(el) => {
                  fieldRefs.current.phone = el ?? undefined;
                }}
                className={styles.input}
                type="tel"
                autoComplete="tel"
                value={values.phone}
                onChange={(event) => setField('phone', event.target.value)}
                onBlur={handleBlur('phone')}
              />
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

      <div className={styles.actions}>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Processing…' : 'Continue'}
        </Button>
      </div>
    </form>
  );
}
