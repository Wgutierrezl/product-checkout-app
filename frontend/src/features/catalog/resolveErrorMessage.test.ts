import { resolveErrorMessage } from './resolveErrorMessage';

describe('resolveErrorMessage', () => {
  it('returns the given error message when present', () => {
    expect(resolveErrorMessage('Internal server error')).toBe('Internal server error');
  });

  it('falls back to a generic message when the error is null', () => {
    expect(resolveErrorMessage(null)).toBe('Something went wrong loading products.');
  });
});
