import { SystemClockAdapter } from './system-clock.adapter';

describe('SystemClockAdapter', () => {
  it('returns the current date reported by the system clock', () => {
    const fixedNow = new Date('2026-09-23T10:00:00.000Z');
    jest.useFakeTimers().setSystemTime(fixedNow);

    const clock = new SystemClockAdapter();

    expect(clock.now()).toEqual(fixedNow);

    jest.useRealTimers();
  });

  it('returns a fresh Date instance on each call reflecting time progression', () => {
    const first = new Date('2026-09-23T10:00:00.000Z');
    const second = new Date('2026-09-23T10:00:05.000Z');
    jest.useFakeTimers().setSystemTime(first);

    const clock = new SystemClockAdapter();
    const firstCall = clock.now();

    jest.setSystemTime(second);
    const secondCall = clock.now();

    expect(firstCall).toEqual(first);
    expect(secondCall).toEqual(second);
    jest.useRealTimers();
  });
});
