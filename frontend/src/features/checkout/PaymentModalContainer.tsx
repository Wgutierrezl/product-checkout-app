import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { Modal } from '../../shared/ui/Modal';
import { PaymentForm, type PaymentFormSubmitValues } from './PaymentForm';
import {
  cardTokenized,
  customerAndDeliverySet,
  installmentsSet,
  stepChangeRequested,
  submitErrorSet,
  submitStatusSet,
  tokenizeFailed,
} from './checkoutSlice';
import { tokenizeCard } from '../../api/paymentGatewayClient';
import { detectCardBrand } from '../../domain/card/brand';
import { getLast4 } from '../../domain/card/mask';

const MODAL_TITLE_ID = 'payment-modal-title';

/**
 * Wraps `PaymentForm` in the `Modal`, connecting it to the checkout slice.
 * On successful tokenization dispatches `cardTokenized` + the card summary
 * + customer/delivery, and moves the step to SUMMARY. On failure, records
 * the error and keeps the buyer on DETAILS — customer/delivery are only
 * ever committed to the store on a SUCCESSFUL Continue (see design
 * Amendment: tokenize at Continue).
 */
export function PaymentModalContainer() {
  const dispatch = useAppDispatch();
  const customer = useAppSelector((state) => state.checkout.customer);
  const delivery = useAppSelector((state) => state.checkout.delivery);
  const installments = useAppSelector((state) => state.checkout.installments);
  const submitStatus = useAppSelector((state) => state.checkout.submitStatus);
  const submitError = useAppSelector((state) => state.checkout.submitError);

  function handleCancel() {
    dispatch(stepChangeRequested('PRODUCT'));
  }

  async function handleSubmit(values: PaymentFormSubmitValues) {
    dispatch(submitStatusSet('tokenizing'));
    dispatch(submitErrorSet(null));

    try {
      const { cardToken } = await tokenizeCard({
        number: values.cardNumber,
        cvc: values.cvc,
        expMonth: String(values.expMonth).padStart(2, '0'),
        expYear: String(values.expYear),
        cardHolder: values.cardHolder,
      });

      dispatch(customerAndDeliverySet({ customer: values.customer, delivery: values.delivery }));
      dispatch(installmentsSet(values.installments));
      dispatch(
        cardTokenized({
          cardToken,
          cardSummary: {
            brand: detectCardBrand(values.cardNumber),
            last4: getLast4(values.cardNumber),
            holder: values.cardHolder,
          },
        }),
      );
      dispatch(stepChangeRequested('SUMMARY'));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Card tokenization failed';
      dispatch(tokenizeFailed(message));
    }
  }

  return (
    <Modal titleId={MODAL_TITLE_ID} title="Payment details" onClose={handleCancel}>
      <PaymentForm
        initialCustomer={customer}
        initialDelivery={delivery}
        initialInstallments={installments}
        isSubmitting={submitStatus === 'tokenizing'}
        submitError={submitError}
        onCancel={handleCancel}
        onSubmit={handleSubmit}
      />
    </Modal>
  );
}
