import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiParam, ApiTags } from '@nestjs/swagger';

import { GetDeliveryUseCase } from '../application/get-delivery.use-case';
import { DeliveryResponseDto } from './dto/delivery.dto';

@ApiTags('deliveries')
@Controller('deliveries')
export class DeliveriesController {
  constructor(private readonly getDeliveryUseCase: GetDeliveryUseCase) {}

  @Get(':id')
  @ApiParam({ name: 'id', description: 'Delivery id (UUID v4)' })
  @ApiOkResponse({ type: DeliveryResponseDto })
  @ApiNotFoundResponse({ description: 'Delivery not found' })
  async getById(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<DeliveryResponseDto> {
    const result = await this.getDeliveryUseCase.execute(id);

    return result.match(
      (delivery) => DeliveryResponseDto.fromDomain(delivery),
      (error) => {
        throw error;
      },
    );
  }
}
