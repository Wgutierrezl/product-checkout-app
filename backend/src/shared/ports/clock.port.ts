export interface ClockPort {
  now(): Date;
}

export const CLOCK_PORT = Symbol('CLOCK_PORT');
