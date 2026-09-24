import { isTransactionStatus, TRANSACTION_STATUSES } from './transaction-status.vo';

describe('isTransactionStatus', () => {
  it('accepts every known transaction status', () => {
    for (const status of TRANSACTION_STATUSES) {
      expect(isTransactionStatus(status)).toBe(true);
    }
  });

  it('rejects an unknown status string', () => {
    expect(isTransactionStatus('REFUNDED')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isTransactionStatus('')).toBe(false);
  });
});
