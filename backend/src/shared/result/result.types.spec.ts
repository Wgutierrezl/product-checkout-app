import { NotFoundError } from '../errors/domain-error';
import { err, ok } from './result.types';

describe('result.types re-exports', () => {
  it('ok() wraps a success value usable as AppResult<T>', () => {
    const result = ok<number>(42);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe(42);
  });

  it('err() wraps a DomainError usable as AppResult<T>', () => {
    const result = err(new NotFoundError('missing'));

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().message).toBe('missing');
  });
});
