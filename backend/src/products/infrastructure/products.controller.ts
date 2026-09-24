import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBadRequestResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

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
  @ApiOperation({ summary: 'List every product available for checkout.' })
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
  @ApiOperation({ summary: 'Get a single product by id, including current stock.' })
  @ApiParam({ name: 'id', description: 'Product id (UUID v4)' })
  @ApiOkResponse({ type: ProductResponseDto })
  @ApiBadRequestResponse({ description: 'Malformed id (not a UUID v4)' })
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
