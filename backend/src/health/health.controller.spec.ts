import 'reflect-metadata';

import { ClockPort } from '../shared/ports/clock.port';
import { HealthController } from './health.controller';

// @nestjs/throttler's internal metadata key for @SkipThrottle(); not publicly
// exported as a named constant, so we assert against its known literal value.
const THROTTLER_SKIP_METADATA_KEY = 'THROTTLER:SKIPdefault';

describe('HealthController', () => {
  it('is exempt from the global throttler guard via @SkipThrottle()', () => {
    const isSkipped = Reflect.getMetadata(THROTTLER_SKIP_METADATA_KEY, HealthController);

    expect(isSkipped).toBe(true);
  });

  it('reports ok status with the current timestamp from the clock port', () => {
    const fixedNow = new Date('2026-09-23T12:00:00.000Z');
    const clock: ClockPort = { now: () => fixedNow };
    const controller = new HealthController(clock);

    expect(controller.check()).toEqual({
      status: 'ok',
      timestamp: '2026-09-23T12:00:00.000Z',
    });
  });

  it('reflects a different clock reading on a later check', () => {
    const laterNow = new Date('2026-09-23T12:05:30.000Z');
    const clock: ClockPort = { now: () => laterNow };
    const controller = new HealthController(clock);

    expect(controller.check().timestamp).toBe('2026-09-23T12:05:30.000Z');
  });
});
