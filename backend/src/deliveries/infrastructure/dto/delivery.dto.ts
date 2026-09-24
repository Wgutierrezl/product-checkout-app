import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { maskAddress } from '../../../shared/pii/mask-pii';
import { DELIVERY_STATUSES, Delivery, DeliveryStatus } from '../../domain/delivery.entity';

/**
 * `customerId` is intentionally NOT included in this response, and `address`
 * is partially masked. This is an unauthenticated, guest-checkout endpoint
 * (no auth layer in this app), so a `deliveryId` obtained/guessed by a third
 * party should not leak the linked customer's identity or the full delivery
 * address. The buyer already has their full address in their own UI state
 * right after checkout — they don't need it echoed back unmasked here.
 */
export class DeliveryResponseDto {
  @ApiProperty({ example: 'e1a6b6b0-6c9e-4a3a-9c1a-6f6f2b6b1a10' })
  id!: string;

  @ApiProperty({ example: 'a689d0fb-a89f-4a4c-a166-acd36c592ae4' })
  transactionId!: string;

  @ApiProperty({
    example: 'Cra ***',
    description: 'Partially masked — only the first 4 characters are visible.',
  })
  address!: string;

  @ApiProperty({ example: 'Bogotá' })
  city!: string;

  @ApiProperty({ example: 'Cundinamarca' })
  region!: string;

  @ApiPropertyOptional({ example: '110231' })
  postalCode?: string;

  @ApiProperty({ example: 'CREATED', enum: [...DELIVERY_STATUSES] })
  status!: DeliveryStatus;

  @ApiProperty({ example: '2026-09-23T00:00:00.000Z' })
  createdAt!: string;

  static fromDomain(delivery: Delivery): DeliveryResponseDto {
    const dto = new DeliveryResponseDto();
    dto.id = delivery.id;
    dto.transactionId = delivery.transactionId;
    dto.address = maskAddress(delivery.address);
    dto.city = delivery.city;
    dto.region = delivery.region;
    dto.postalCode = delivery.postalCode;
    dto.status = delivery.status;
    dto.createdAt = delivery.createdAt;
    return dto;
  }
}
