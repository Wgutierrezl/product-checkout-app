import { Type } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsNotEmpty,
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
  @ApiProperty({ example: 'e1a6b6b0-6c9e-4a3a-9c1a-6f6f2b6b1a10' })
  @IsUUID('4')
  productId!: string;

  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiProperty({ type: CreateTransactionCustomerDto })
  @ValidateNested()
  @Type(() => CreateTransactionCustomerDto)
  customer!: CreateTransactionCustomerDto;

  @ApiProperty({ type: CreateTransactionDeliveryDto })
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
