import { Result, ResultAsync, err, errAsync, ok, okAsync } from 'neverthrow';

import { DomainError } from '../errors/domain-error';

export type AppResult<T> = Result<T, DomainError>;
export type AppResultAsync<T> = ResultAsync<T, DomainError>;

export { err, errAsync, ok, okAsync };
