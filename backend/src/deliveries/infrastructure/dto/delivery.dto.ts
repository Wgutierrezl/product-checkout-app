import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Delivery } from '../../domain/delivery.entity';

export class DeliveryResponseDto {
  @ApiProperty({ example: 'e1a6b6b0-6c9e-4a3a-9c1a-6f6f2b6b1a10' })
  id!: string;

  @ApiProperty({ example: 'a689d0fb-a89f-4a4c-a166-acd36c592ae4' })
  transactionId!: string;

  @ApiProperty({ example: '21a35f72-5941-42b4-9df6-8dab1e017c1b' })
  customerId!: string;

  @ApiProperty({ example: 'Cra 7 # 71-21' })
  address!: string;

  @ApiProperty({ example: 'Bogotá' })
  city!: string;

  @ApiProperty({ example: 'Cundinamarca' })
  region!: string;

  @ApiPropertyOptional({ example: '110231' })
  postalCode?: string;

  @ApiProperty({ example: 'CREATED' })
  status!: string;

  @ApiProperty({ example: '2026-09-23T00:00:00.000Z' })
  createdAt!: string;

  static fromDomain(delivery: Delivery): DeliveryResponseDto {
    const dto = new DeliveryResponseDto();
    dto.id = delivery.id;
    dto.transactionId = delivery.transactionId;
    dto.customerId = delivery.customerId;
    dto.address = delivery.address;
    dto.city = delivery.city;
    dto.region = delivery.region;
    dto.postalCode = delivery.postalCode;
    dto.status = delivery.status;
    dto.createdAt = delivery.createdAt;
    return dto;
  }
}
