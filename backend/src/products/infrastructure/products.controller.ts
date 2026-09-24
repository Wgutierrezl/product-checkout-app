import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiParam, ApiTags } from '@nestjs/swagger';

import { GetProductUseCase } from '../application/get-product.use-case';
import { ListProductsUseCase } from '../application/list-products.use-case';
import { ProductResponseDto } from './dto/product.dto';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(
    private readonly listProductsUseCase: ListProductsUseCase,
    private readonly getProductUseCase: GetProductUseCase,
  ) {}

  @Get()
  @ApiOkResponse({ type: ProductResponseDto, isArray: true })
  async list(): Promise<ProductResponseDto[]> {
    const result = await this.listProductsUseCase.execute();

    return result.match(
      (products) => products.map((product) => ProductResponseDto.fromDomain(product)),
      (error) => {
        throw error;
      },
    );
  }

  @Get(':id')
  @ApiParam({ name: 'id', description: 'Product id (UUID v4)' })
  @ApiOkResponse({ type: ProductResponseDto })
  @ApiNotFoundResponse({ description: 'Product not found' })
  async getById(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<ProductResponseDto> {
    const result = await this.getProductUseCase.execute(id);

    return result.match(
      (product) => ProductResponseDto.fromDomain(product),
      (error) => {
        throw error;
      },
    );
  }
}
