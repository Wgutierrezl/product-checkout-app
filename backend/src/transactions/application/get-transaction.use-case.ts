import { Inject, Injectable } from '@nestjs/common';

import { AppResultAsync } from '../../shared/result/result.types';
import { Transaction } from '../domain/transaction.entity';
import { TRANSACTION_REPOSITORY_PORT, TransactionRepositoryPort } from '../domain/transaction.repository.port';

/**
 * Minimal read path for PR5 — no lazy-poll-on-read yet (that's PR6, per
 * design's `settle-transaction`/stale-PENDING refresh). Just returns the
 * stored transaction as-is.
 */
@Injectable()
export class GetTransactionUseCase {
  constructor(
    @Inject(TRANSACTION_REPOSITORY_PORT) private readonly transactions: TransactionRepositoryPort,
  ) {}

  execute(id: string): AppResultAsync<Transaction> {
    return this.transactions.findById(id);
  }
}
