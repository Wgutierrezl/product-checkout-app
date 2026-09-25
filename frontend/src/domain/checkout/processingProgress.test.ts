import { PROCESSING_STEPS, msUntilNextProcessingStep, resolveProcessingStepIndex } from './processingProgress';

describe('PROCESSING_STEPS', () => {
  it('lists the 3 steps shown on the PENDING result screen, in order', () => {
    expect(PROCESSING_STEPS).toEqual(['Payment sent', 'Confirming with your bank', 'Updating your order']);
  });
});

describe('resolveProcessingStepIndex', () => {
  const totalMs = 60_000;

  it('is at step 0 right at the start', () => {
    expect(resolveProcessingStepIndex(0, totalMs)).toBe(0);
  });

  it('stays at step 0 for just under the 1st third of the total duration', () => {
    expect(resolveProcessingStepIndex(19_999, totalMs)).toBe(0);
  });

  it('moves to step 1 at the 1st third of the total duration', () => {
    expect(resolveProcessingStepIndex(20_000, totalMs)).toBe(1);
  });

  it('stays at step 1 for just under the 2nd third of the total duration', () => {
    expect(resolveProcessingStepIndex(39_999, totalMs)).toBe(1);
  });

  it('moves to step 2 at the 2nd third of the total duration', () => {
    expect(resolveProcessingStepIndex(40_000, totalMs)).toBe(2);
  });

  it('clamps at the last step once the total duration is exceeded', () => {
    expect(resolveProcessingStepIndex(120_000, totalMs)).toBe(2);
  });

  it('clamps negative elapsed time to step 0', () => {
    expect(resolveProcessingStepIndex(-5_000, totalMs)).toBe(0);
  });

  it('defaults the total duration to the poll budget (60s) when not given', () => {
    expect(resolveProcessingStepIndex(0)).toBe(0);
    expect(resolveProcessingStepIndex(60_000)).toBe(2);
  });
});

describe('msUntilNextProcessingStep', () => {
  const totalMs = 60_000;

  it('returns the time left until the 1st third boundary, right at the start', () => {
    expect(msUntilNextProcessingStep(0, totalMs)).toBe(20_000);
  });

  it('returns the remaining time partway through step 0', () => {
    expect(msUntilNextProcessingStep(5_000, totalMs)).toBe(15_000);
  });

  it('returns the time left until the 2nd third boundary, partway through step 1', () => {
    expect(msUntilNextProcessingStep(30_000, totalMs)).toBe(10_000);
  });

  it('returns null once already at the last step (nothing left to schedule)', () => {
    expect(msUntilNextProcessingStep(40_000, totalMs)).toBeNull();
    expect(msUntilNextProcessingStep(120_000, totalMs)).toBeNull();
  });

  it('defaults the total duration to the poll budget (60s) when not given', () => {
    expect(msUntilNextProcessingStep(0)).toBe(20_000);
  });
});
