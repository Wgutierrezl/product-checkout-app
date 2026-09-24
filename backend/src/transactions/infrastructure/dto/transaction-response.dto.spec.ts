import { buildDelivery } from '../../../deliveries/test/delivery.fixtures';
import { buildTransaction } from '../../test/transaction.fixtures';
import { TransactionResponseDto } from './transaction-response.dto';

describe('TransactionResponseDto.fromDomain', () => {
  it('maps a transaction without a delivery argument to a dto with no delivery field', () => {
    const transaction = buildTransaction({ status: 'PENDING' });

    const dto = TransactionResponseDto.fromDomain(transaction);

    expect(dto.delivery).toBeUndefined();
  });

  it('maps a transaction with delivery=null to a dto with no delivery field', () => {
    const transaction = buildTransaction({ status: 'PENDING' });

    const dto = TransactionResponseDto.fromDomain(transaction, null);

    expect(dto.delivery).toBeUndefined();
  });

  it('embeds the masked delivery when given a delivery', () => {
    const transaction = buildTransaction({ status: 'APPROVED' });
    const delivery = buildDelivery({ transactionId: transaction.id, address: 'Cra 7 # 71-21' });

    const dto = TransactionResponseDto.fromDomain(transaction, delivery);

    expect(dto.delivery).toBeDefined();
    expect(dto.delivery?.id).toBe(delivery.id);
    expect(dto.delivery?.address).toBe('Cra ***');
  });
});
