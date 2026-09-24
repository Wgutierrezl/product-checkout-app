import { ApiProperty } from '@nestjs/swagger';

import { Transaction } from '../../domain/transaction.entity';
import { TransactionStatus } from '../../domain/transaction-status.vo';

export class TransactionResponseDto {
  @ApiProperty({ example: 'e1a6b6b0-6c9e-4a3a-9c1a-6f6f2b6b1a10' })
  id!: string;

  @ApiProperty({ example: 'REF-9c1a6f6f2b6b1a10' })
  reference!: string;

  @ApiProperty({ example: 'PENDING', enum: ['PENDING', 'APPROVED', 'DECLINED', 'VOIDED', 'ERROR'] })
  status!: TransactionStatus;

  @ApiProperty({ example: 300_000, description: 'Unit price x quantity, in integer cents' })
  productAmount!: number;

  @ApiProperty({ example: 250_000, description: 'Base fee, in integer cents' })
  baseFee!: number;

  @ApiProperty({ example: 800_000, description: 'Delivery fee, in integer cents' })
  deliveryFee!: number;

  @ApiProperty({ example: 1_350_000, description: 'productAmount + baseFee + deliveryFee, in integer cents' })
  total!: number;

  @ApiProperty({ example: 'COP' })
  currency!: 'COP';

  static fromDomain(transaction: Transaction): TransactionResponseDto {
    const dto = new TransactionResponseDto();
    dto.id = transaction.id;
    dto.reference = transaction.reference;
    dto.status = transaction.status;
    dto.productAmount = transaction.unitPrice.valueInCents * transaction.quantity.value;
    dto.baseFee = transaction.baseFee.valueInCents;
    dto.deliveryFee = transaction.deliveryFee.valueInCents;
    dto.total = transaction.totalAmount.valueInCents;
    dto.currency = 'COP';
    return dto;
  }
}
