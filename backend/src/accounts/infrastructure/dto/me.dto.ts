import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

import { DELIVERY_STATUSES, DeliveryStatus } from '../../../deliveries/domain/delivery.entity';
import { TRANSACTION_STATUSES, TransactionStatus } from '../../../transactions/domain/transaction-status.vo';
import { User, UserPreferences } from '../../domain/user.entity';
import { TransactionHistoryItem } from '../../application/list-my-transactions.use-case';

/**
 * Mirrors `CreateTransactionCustomerDto`/`CreateTransactionDeliveryDto`'s
 * validation rules EXACTLY (see `create-transaction.dto.ts`) so a saved
 * preference is always valid checkout input — `fullName`/`email` are
 * deliberately NOT part of preferences (they already live on the account
 * itself, see `MeResponseDto`). PUT semantics: every field except
 * `postalCode` is required, matching the checkout form's own requiredness.
 */
export class UpdatePreferencesDto {
  @ApiProperty({ example: '+573001234567' })
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @ApiProperty({ example: 'Cra 1 # 2-3' })
  @IsString()
  @IsNotEmpty()
  address!: string;

  @ApiProperty({ example: 'Bogota' })
  @IsString()
  @IsNotEmpty()
  city!: string;

  @ApiProperty({ example: 'Cundinamarca' })
  @IsString()
  @IsNotEmpty()
  region!: string;

  @ApiPropertyOptional({ example: '110111' })
  @IsOptional()
  @IsString()
  postalCode?: string;
}

export class UserPreferencesDto {
  @ApiPropertyOptional({ example: '+573001234567' })
  phone?: string;

  @ApiPropertyOptional({ example: 'Cra 1 # 2-3' })
  address?: string;

  @ApiPropertyOptional({ example: 'Bogota' })
  city?: string;

  @ApiPropertyOptional({ example: 'Cundinamarca' })
  region?: string;

  @ApiPropertyOptional({ example: '110111' })
  postalCode?: string;

  static fromDomain(preferences: UserPreferences): UserPreferencesDto {
    const dto = new UserPreferencesDto();
    dto.phone = preferences.phone;
    dto.address = preferences.address;
    dto.city = preferences.city;
    dto.region = preferences.region;
    dto.postalCode = preferences.postalCode;
    return dto;
  }
}

export class MeResponseDto {
  @ApiProperty({ example: 'e1a6b6b0-6c9e-4a3a-9c1a-6f6f2b6b1a10' })
  userId!: string;

  @ApiProperty({ example: 'jane.doe@example.com' })
  email!: string;

  @ApiProperty({ example: 'Jane Doe' })
  fullName!: string;

  @ApiPropertyOptional({ type: UserPreferencesDto, description: 'Absent until the first PUT /me/preferences.' })
  preferences?: UserPreferencesDto;

  /**
   * Built from a `Pick` of `User`'s public fields — `passwordHash` is never
   * even a parameter type here, so it structurally cannot leak (same
   * discipline as `RegisterResponseDto.fromDomain`/`LoginResponseDto.from`).
   */
  static fromDomain(user: Pick<User, 'id' | 'email' | 'fullName' | 'preferences'>): MeResponseDto {
    const dto = new MeResponseDto();
    dto.userId = user.id;
    dto.email = user.email;
    dto.fullName = user.fullName;
    dto.preferences = user.preferences ? UserPreferencesDto.fromDomain(user.preferences) : undefined;
    return dto;
  }
}

export class TransactionHistoryDeliveryDto {
  @ApiProperty({ example: 'Cra 7 # 71-21', description: 'Full, unmasked address — the caller is the owner.' })
  address!: string;

  @ApiProperty({ example: 'Bogota' })
  city!: string;

  @ApiProperty({ example: 'Cundinamarca' })
  region!: string;

  @ApiPropertyOptional({ example: '110231' })
  postalCode?: string;

  @ApiProperty({ example: 'CREATED', enum: [...DELIVERY_STATUSES] })
  status!: DeliveryStatus;
}

export class TransactionHistoryItemDto {
  @ApiProperty({ example: 'a689d0fb-a89f-4a4c-a166-acd36c592ae4' })
  transactionId!: string;

  @ApiProperty({ example: 'e1a6b6b0-6c9e-4a3a-9c1a-6f6f2b6b1a10' })
  productId!: string;

  @ApiPropertyOptional({ example: 'Wireless Headphones', description: 'Absent if the product no longer exists.' })
  productName?: string;

  @ApiProperty({ example: 1_350_000, description: 'Total charged, in integer cents.' })
  amount!: number;

  @ApiProperty({ example: 'APPROVED', enum: [...TRANSACTION_STATUSES] })
  status!: TransactionStatus;

  @ApiProperty({ example: '2026-09-23T00:00:00.000Z' })
  createdAt!: string;

  @ApiPropertyOptional({ type: TransactionHistoryDeliveryDto, description: 'Present only once APPROVED.' })
  delivery?: TransactionHistoryDeliveryDto;

  static fromDomain(item: TransactionHistoryItem): TransactionHistoryItemDto {
    const dto = new TransactionHistoryItemDto();
    dto.transactionId = item.transactionId;
    dto.productId = item.productId;
    dto.productName = item.productName;
    dto.amount = item.amount;
    dto.status = item.status;
    dto.createdAt = item.createdAt;
    dto.delivery = item.delivery;
    return dto;
  }
}
