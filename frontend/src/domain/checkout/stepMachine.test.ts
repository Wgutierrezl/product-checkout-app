import {
  canEnterStep,
  resolveStep,
  type StepPrerequisites,
} from './stepMachine';

const noPrerequisites: StepPrerequisites = {
  hasProductSelection: false,
  hasCustomerAndDelivery: false,
  hasSubmittedPayment: false,
};

describe('canEnterStep', () => {
  it('always allows PRODUCT', () => {
    expect(canEnterStep('PRODUCT', noPrerequisites)).toBe(true);
  });
});

describe('resolveStep', () => {
  it('always allows entering PRODUCT regardless of prerequisites', () => {
    expect(resolveStep('PRODUCT', noPrerequisites)).toBe('PRODUCT');
  });

  it('blocks entering DETAILS without a product/quantity selection and stays on PRODUCT', () => {
    expect(resolveStep('DETAILS', noPrerequisites)).toBe('PRODUCT');
  });

  it('allows entering DETAILS once a product is selected', () => {
    expect(
      resolveStep('DETAILS', {
        ...noPrerequisites,
        hasProductSelection: true,
      }),
    ).toBe('DETAILS');
  });

  it('blocks entering SUMMARY without customer/delivery data and falls back to DETAILS', () => {
    expect(
      resolveStep('SUMMARY', {
        ...noPrerequisites,
        hasProductSelection: true,
      }),
    ).toBe('DETAILS');
  });

  it('allows entering SUMMARY once product and customer/delivery are set', () => {
    expect(
      resolveStep('SUMMARY', {
        hasProductSelection: true,
        hasCustomerAndDelivery: true,
        hasSubmittedPayment: false,
      }),
    ).toBe('SUMMARY');
  });

  it('blocks entering RESULT before payment has been submitted', () => {
    expect(
      resolveStep('RESULT', {
        hasProductSelection: true,
        hasCustomerAndDelivery: true,
        hasSubmittedPayment: false,
      }),
    ).toBe('SUMMARY');
  });

  it('allows entering RESULT once payment has been submitted', () => {
    expect(
      resolveStep('RESULT', {
        hasProductSelection: true,
        hasCustomerAndDelivery: true,
        hasSubmittedPayment: true,
      }),
    ).toBe('RESULT');
  });
});
