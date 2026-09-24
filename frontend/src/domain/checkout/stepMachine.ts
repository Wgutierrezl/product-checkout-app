export type CheckoutStep = 'PRODUCT' | 'DETAILS' | 'SUMMARY' | 'RESULT';

export interface StepPrerequisites {
  hasProductSelection: boolean;
  hasCustomerAndDelivery: boolean;
  hasSubmittedPayment: boolean;
}

const STEP_ORDER: CheckoutStep[] = ['PRODUCT', 'DETAILS', 'SUMMARY', 'RESULT'];

/** Whether `step` may be entered given the current prerequisites. */
export function canEnterStep(
  step: CheckoutStep,
  prerequisites: StepPrerequisites,
): boolean {
  switch (step) {
    case 'PRODUCT':
      return true;
    case 'DETAILS':
      return prerequisites.hasProductSelection;
    case 'SUMMARY':
      return (
        prerequisites.hasProductSelection &&
        prerequisites.hasCustomerAndDelivery
      );
    case 'RESULT':
      return (
        prerequisites.hasProductSelection &&
        prerequisites.hasCustomerAndDelivery &&
        prerequisites.hasSubmittedPayment
      );
  }
}

/**
 * Resolves the step the buyer should actually land on when attempting
 * to reach `target`: `target` itself if its prerequisites are met,
 * otherwise the highest step in the flow whose prerequisites ARE met.
 */
export function resolveStep(
  target: CheckoutStep,
  prerequisites: StepPrerequisites,
): CheckoutStep {
  const targetIndex = STEP_ORDER.indexOf(target);

  for (let i = targetIndex; i > 0; i--) {
    const candidate = STEP_ORDER[i];
    if (canEnterStep(candidate, prerequisites)) {
      return candidate;
    }
  }

  return 'PRODUCT';
}
