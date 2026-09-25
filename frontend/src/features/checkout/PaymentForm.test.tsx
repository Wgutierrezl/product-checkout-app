import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaymentForm } from './PaymentForm';
import type { CustomerInput, DeliveryInput } from '../../api/types';

const CUSTOMER: CustomerInput = { fullName: 'Jane Doe', email: 'jane@example.com', phone: '+573001234567' };
const DELIVERY: DeliveryInput = { address: 'Cra 1 # 2-3', city: 'Bogota', region: 'Cundinamarca' };

function renderForm(overrides: Partial<React.ComponentProps<typeof PaymentForm>> = {}) {
  const onSubmit = jest.fn();
  const onCancel = jest.fn();
  const utils = render(
    <PaymentForm
      initialCustomer={null}
      initialDelivery={null}
      initialInstallments={1}
      isSubmitting={false}
      submitError={null}
      onCancel={onCancel}
      onSubmit={onSubmit}
      {...overrides}
    />,
  );
  return { ...utils, onSubmit, onCancel };
}

/** A fully valid set of field values, filled in field-by-field via user-event. */
async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/card number/i), '4111111111111111');
  await user.type(screen.getByLabelText(/cardholder name/i), 'Jane Doe');
  await user.type(screen.getByLabelText(/expiry/i), '09/30');
  await user.type(screen.getByLabelText(/cvc/i), '123');
  await user.type(screen.getByLabelText(/full name/i), 'Jane Doe');
  await user.type(screen.getByLabelText(/email/i), 'jane@example.com');
  await user.type(screen.getByLabelText(/phone/i), '+573001234567');
  await user.type(screen.getByLabelText(/^address/i), 'Cra 1 # 2-3');
  await user.type(screen.getByLabelText(/city/i), 'Bogota');
  await user.type(screen.getByLabelText(/region/i), 'Cundinamarca');
}

describe('PaymentForm', () => {
  describe('expiry auto-format', () => {
    it('inserts a slash automatically as the buyer types digits only', async () => {
      const user = userEvent.setup();
      renderForm();

      await user.type(screen.getByLabelText(/expiry/i), '1229');

      expect(screen.getByLabelText(/expiry/i)).toHaveValue('12/29');
    });

    it('auto-pads a leading month digit greater than 1', async () => {
      const user = userEvent.setup();
      renderForm();

      await user.type(screen.getByLabelText(/expiry/i), '4');

      expect(screen.getByLabelText(/expiry/i)).toHaveValue('04/');
    });

    it('normalizes a pasted value with a 4-digit year and stray spaces', async () => {
      renderForm();
      const input = screen.getByLabelText(/expiry/i);

      fireEvent.change(input, { target: { value: '12 / 2029' } });

      expect(input).toHaveValue('12/29');
    });

    it('drops the auto-inserted slash naturally when backspacing the 3rd digit', async () => {
      const user = userEvent.setup();
      renderForm();
      const input = screen.getByLabelText(/expiry/i);

      await user.type(input, '123');
      expect(input).toHaveValue('12/3');

      await user.type(input, '{backspace}');
      expect(input).toHaveValue('12');
    });

    it('exposes numeric input mode and the cc-exp autocomplete hint', () => {
      renderForm();

      const input = screen.getByLabelText(/expiry/i);
      expect(input).toHaveAttribute('inputMode', 'numeric');
      expect(input).toHaveAttribute('autoComplete', 'cc-exp');
    });
  });

  describe('card number formatting, brand detection, and masking', () => {
    it('formats the card number into 4-digit groups as the buyer types', async () => {
      const user = userEvent.setup();
      renderForm();

      await user.type(screen.getByLabelText(/card number/i), '4111111111111111');

      expect(screen.getByLabelText(/card number/i)).toHaveValue('4111 1111 1111 1111');
    });

    it('shows the Visa mark once the BIN is recognized', async () => {
      const user = userEvent.setup();
      renderForm();

      await user.type(screen.getByLabelText(/card number/i), '411111');

      expect(screen.getByRole('img', { name: 'Visa' })).toBeInTheDocument();
    });

    it('shows the Mastercard mark once the BIN is recognized', async () => {
      const user = userEvent.setup();
      renderForm();

      await user.type(screen.getByLabelText(/card number/i), '5105105105105100');

      expect(screen.getByRole('img', { name: 'Mastercard' })).toBeInTheDocument();
    });

    it('shows an unsupported-brand message and no logo for an unrecognized BIN', async () => {
      const user = userEvent.setup();
      renderForm();

      await user.type(screen.getByLabelText(/card number/i), '999999999999');

      expect(screen.getByText(/unsupported card brand/i)).toBeInTheDocument();
      expect(screen.queryByRole('img', { name: 'Visa' })).not.toBeInTheDocument();
      expect(screen.queryByRole('img', { name: 'Mastercard' })).not.toBeInTheDocument();
    });

    it('masks the CVC visually via CSS rather than type=password (avoids password-manager storage)', () => {
      renderForm();

      const cvcInput = screen.getByLabelText(/cvc/i);
      expect(cvcInput).toHaveAttribute('type', 'text');
      expect(cvcInput).toHaveAttribute('inputMode', 'numeric');
      expect(cvcInput).toHaveAttribute('autoComplete', 'cc-csc');
      expect(cvcInput).toHaveClass('maskedInput');
    });
  });

  describe('inline validation on blur', () => {
    it('shows an error when the card number fails the Luhn check', async () => {
      const user = userEvent.setup();
      renderForm();

      await user.type(screen.getByLabelText(/card number/i), '4111111111111112');
      await user.tab();

      expect(screen.getByText(/invalid card number/i)).toBeInTheDocument();
    });

    it('shows a length error for a Luhn-valid, Visa-prefixed 15-digit number', async () => {
      const user = userEvent.setup();
      renderForm();

      await user.type(screen.getByLabelText(/card number/i), '411111111111116');
      await user.tab();

      expect(screen.getByText(/card number must be 16 digits/i)).toBeInTheDocument();
    });

    it('shows a length error for a Luhn-valid, Visa-prefixed 19-digit number', async () => {
      const user = userEvent.setup();
      renderForm();

      await user.type(screen.getByLabelText(/card number/i), '4111111111111111110');
      await user.tab();

      expect(screen.getByText(/card number must be 16 digits/i)).toBeInTheDocument();
    });

    it('shows an error for an expired card', async () => {
      const user = userEvent.setup();
      renderForm();

      await user.type(screen.getByLabelText(/expiry/i), '01/20');
      await user.tab();

      expect(screen.getByText(/card is expired/i)).toBeInTheDocument();
    });

    it('shows an error for a malformed expiry string', async () => {
      const user = userEvent.setup();
      renderForm();

      await user.type(screen.getByLabelText(/expiry/i), 'nope');
      await user.tab();

      expect(screen.getByText(/enter a valid expiry date/i)).toBeInTheDocument();
    });

    it('shows an error for an invalid CVC', async () => {
      const user = userEvent.setup();
      renderForm();

      await user.type(screen.getByLabelText(/cvc/i), '12');
      await user.tab();

      expect(screen.getByText(/enter a valid 3-digit cvc/i)).toBeInTheDocument();
    });

    it('shows "Unsupported card brand" on submit for a Luhn-valid number from an unrecognized network', async () => {
      const user = userEvent.setup();
      const { onSubmit } = renderForm();

      // Luhn-valid but no BIN matches Visa/Mastercard.
      await user.type(screen.getByLabelText(/card number/i), '9999999999999995');
      await user.tab();

      expect(screen.getByRole('alert')).toHaveTextContent(/unsupported card brand/i);
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('shows a required-field error for an empty address on blur', async () => {
      const user = userEvent.setup();
      renderForm();

      await user.click(screen.getByLabelText(/^address/i));
      await user.tab();

      expect(screen.getByText(/address is required/i)).toBeInTheDocument();
    });

    it('shows an invalid-email error', async () => {
      const user = userEvent.setup();
      renderForm();

      await user.type(screen.getByLabelText(/email/i), 'not-an-email');
      await user.tab();

      expect(screen.getByText(/enter a valid email address/i)).toBeInTheDocument();
    });
  });

  describe('submission', () => {
    it('blocks submission and focuses the first invalid field when the form is empty', async () => {
      const user = userEvent.setup();
      const { onSubmit } = renderForm();

      await user.click(screen.getByRole('button', { name: /continue/i }));

      expect(onSubmit).not.toHaveBeenCalled();
      expect(screen.getByLabelText(/card number/i)).toHaveFocus();
      expect(screen.getByText(/card number is required/i)).toBeInTheDocument();
    });

    it('submits normalized values when every field is valid', async () => {
      const user = userEvent.setup();
      const { onSubmit } = renderForm();

      await fillValidForm(user);
      await user.click(screen.getByRole('button', { name: /continue/i }));

      expect(onSubmit).toHaveBeenCalledWith({
        cardNumber: '4111111111111111',
        cardHolder: 'Jane Doe',
        expMonth: 9,
        expYear: 2030,
        cvc: '123',
        installments: 1,
        customer: { fullName: 'Jane Doe', email: 'jane@example.com', phone: '+573001234567' },
        delivery: { address: 'Cra 1 # 2-3', city: 'Bogota', region: 'Cundinamarca' },
      });
    });

    it('includes postalCode in the delivery payload when provided', async () => {
      const user = userEvent.setup();
      const { onSubmit } = renderForm();

      await fillValidForm(user);
      await user.type(screen.getByLabelText(/postal code/i), '110111');
      await user.click(screen.getByRole('button', { name: /continue/i }));

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ delivery: expect.objectContaining({ postalCode: '110111' }) }),
      );
    });

    it('disables Continue and shows a processing label while isSubmitting is true', () => {
      renderForm({ isSubmitting: true });

      const button = screen.getByRole('button', { name: /processing/i });
      expect(button).toBeDisabled();
    });

    it('disables Cancel while isSubmitting is true, so a close cannot race an in-flight submit', () => {
      renderForm({ isSubmitting: true });

      expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
    });

    it('does not call onSubmit when Continue is clicked while already submitting', async () => {
      const user = userEvent.setup();
      const { onSubmit } = renderForm({ isSubmitting: true });

      await user.click(screen.getByRole('button', { name: /processing/i }));

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('shows the gateway/tokenize error from the container as an alert', () => {
      renderForm({ submitError: 'Card tokenization failed' });

      expect(screen.getByRole('alert')).toHaveTextContent('Card tokenization failed');
    });

    it('clears PAN/CVC (and cardholder/expiry) but keeps customer/delivery when a tokenize attempt fails', async () => {
      const user = userEvent.setup();
      const { rerender } = renderForm();

      await user.type(screen.getByLabelText(/card number/i), '4111111111111111');
      await user.type(screen.getByLabelText(/cardholder name/i), 'Jane Doe');
      await user.type(screen.getByLabelText(/expiry/i), '09/30');
      await user.type(screen.getByLabelText(/cvc/i), '123');
      await user.type(screen.getByLabelText(/full name/i), 'Jane Doe');
      await user.type(screen.getByLabelText(/^address/i), 'Cra 1 # 2-3');

      rerender(
        <PaymentForm
          initialCustomer={null}
          initialDelivery={null}
          initialInstallments={1}
          isSubmitting={false}
          submitError="Card tokenization failed"
          onCancel={jest.fn()}
          onSubmit={jest.fn()}
        />,
      );

      expect(screen.getByLabelText(/card number/i)).toHaveValue('');
      expect(screen.getByLabelText(/cardholder name/i)).toHaveValue('');
      expect(screen.getByLabelText(/expiry/i)).toHaveValue('');
      expect(screen.getByLabelText(/cvc/i)).toHaveValue('');
      expect(screen.getByLabelText(/full name/i)).toHaveValue('Jane Doe');
      expect(screen.getByLabelText(/^address/i)).toHaveValue('Cra 1 # 2-3');
    });

    it('calls onCancel when Cancel is clicked', async () => {
      const user = userEvent.setup();
      const { onCancel } = renderForm();

      await user.click(screen.getByRole('button', { name: /cancel/i }));

      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe('prefill from store (refresh resilience)', () => {
    it('prefills customer and delivery fields from initial props, leaving card fields empty', () => {
      renderForm({ initialCustomer: CUSTOMER, initialDelivery: DELIVERY, initialInstallments: 3 });

      expect(screen.getByLabelText(/full name/i)).toHaveValue(CUSTOMER.fullName);
      expect(screen.getByLabelText(/email/i)).toHaveValue(CUSTOMER.email);
      expect(screen.getByLabelText(/phone/i)).toHaveValue(CUSTOMER.phone);
      expect(screen.getByLabelText(/^address/i)).toHaveValue(DELIVERY.address);
      expect(screen.getByLabelText(/city/i)).toHaveValue(DELIVERY.city);
      expect(screen.getByLabelText(/region/i)).toHaveValue(DELIVERY.region);
      expect(screen.getByLabelText(/installments/i)).toHaveValue('3');
      expect(screen.getByLabelText(/card number/i)).toHaveValue('');
      expect(screen.getByLabelText(/cvc/i)).toHaveValue('');
    });
  });

  describe('installments', () => {
    it('offers installment options from 1 to 36', () => {
      renderForm();

      const select = screen.getByLabelText(/installments/i);
      expect(select).toContainHTML('<option value="1">1</option>');
      expect(select).toContainHTML('<option value="36">36</option>');
    });

    it('submits the selected installments count', async () => {
      const user = userEvent.setup();
      const { onSubmit } = renderForm();

      await user.selectOptions(screen.getByLabelText(/installments/i), '12');
      await fillValidForm(user);
      await user.click(screen.getByRole('button', { name: /continue/i }));

      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ installments: 12 }));
    });
  });

  describe('double-submit guard', () => {
    it('ignores a submit event while isSubmitting is already true', () => {
      const { onSubmit } = renderForm({ isSubmitting: true });

      // The Continue button is disabled (browsers block clicks on disabled
      // buttons), so submit the <form> directly to exercise the internal
      // isSubmitting guard as defense-in-depth against any other submit path.
      const form = screen.getByRole('button', { name: /processing/i }).closest('form');
      fireEvent.submit(form as HTMLFormElement);

      expect(onSubmit).not.toHaveBeenCalled();
    });
  });
});
