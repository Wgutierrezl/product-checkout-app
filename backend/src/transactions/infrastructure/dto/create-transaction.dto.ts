import { Type } from 'class-transformer';
import {
  IsDefined,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTransactionCustomerDto {
  @ApiProperty({ example: 'Jane Doe' })
  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @ApiProperty({ example: 'jane.doe@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: '+573001234567' })
  @IsString()
  @IsNotEmpty()
  phone!: string;
}

export class CreateTransactionDeliveryDto {
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

  @ApiProperty({ example: '110111', required: false })
  @IsOptional()
  @IsString()
  postalCode?: string;
}

export class CreateTransactionDto {
  @ApiProperty({
    example: 'c4d5e6f7-a8b9-4c0d-8e1f-2a3b4c5d6e7f',
    description:
      'Client-generated UUID v4, one per checkout attempt (generate it once ' +
      'in the frontend before the first submit and reuse it on any retry of ' +
      'the SAME attempt, e.g. after a network timeout). Replaying a request ' +
      'with a previously-used idempotencyKey returns the original ' +
      'transaction unchanged (still 201) and never charges the gateway again.',
  })
  @IsUUID('4')
  idempotencyKey!: string;

  @ApiProperty({ example: 'e1a6b6b0-6c9e-4a3a-9c1a-6f6f2b6b1a10' })
  @IsUUID('4')
  productId!: string;

  @ApiProperty({ example: 2, minimum: 1, maximum: 10 })
  @IsInt()
  @Min(1)
  @Max(10)
  quantity!: number;

  @ApiProperty({ type: CreateTransactionCustomerDto })
  // `@ValidateNested()` alone skips `undefined`, so a body without this
  // object would reach the use case and fail there with a 500.
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => CreateTransactionCustomerDto)
  customer!: CreateTransactionCustomerDto;

  @ApiProperty({ type: CreateTransactionDeliveryDto })
  // `@ValidateNested()` alone skips `undefined`, so a body without this
  // object would reach the use case and fail there with a 500.
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => CreateTransactionDeliveryDto)
  delivery!: CreateTransactionDeliveryDto;

  @ApiProperty({
    example: 'tok_test_...',
    description: 'Gateway-issued card token — the raw PAN/CVC never reach this API.',
  })
  @IsString()
  @IsNotEmpty()
  cardToken!: string;

  @ApiProperty({ example: 1, minimum: 1, maximum: 36 })
  @IsInt()
  @Min(1)
  @Max(36)
  installments!: number;

  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiJ9.eyJ...' })
  @IsString()
  @IsNotEmpty()
  acceptanceToken!: string;

  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiJ9.eyJ...' })
  @IsString()
  @IsNotEmpty()
  acceptPersonalAuth!: string;
}
