import { ApiProperty } from '@nestjs/swagger';

import { Product } from '../../domain/product.entity';

export class ProductResponseDto {
  @ApiProperty({ example: 'e1a6b6b0-6c9e-4a3a-9c1a-6f6f2b6b1a10' })
  id!: string;

  @ApiProperty({ example: 'Wireless Headphones' })
  name!: string;

  @ApiProperty({
    example: 'Noise-cancelling over-ear headphones with 30h battery life',
  })
  description!: string;

  @ApiProperty({ example: 150_000, description: 'Unit price in integer cents' })
  price!: number;

  @ApiProperty({ example: 'COP', description: 'ISO 4217 currency code for `price`' })
  currency!: 'COP';

  @ApiProperty({ example: 10, description: 'Units currently in stock' })
  stock!: number;

  @ApiProperty({ example: 'https://images.unsplash.com/photo-1505740420928' })
  imageUrl!: string;

  static fromDomain(product: Product): ProductResponseDto {
    const dto = new ProductResponseDto();
    dto.id = product.id;
    dto.name = product.name;
    dto.description = product.description;
    dto.price = product.price.valueInCents;
    dto.currency = 'COP';
    dto.stock = product.stock.value;
    dto.imageUrl = product.imageUrl;
    return dto;
  }
}
