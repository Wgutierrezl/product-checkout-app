import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBadRequestResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import { GetCustomerUseCase } from '../application/get-customer.use-case';
import { CustomerResponseDto } from './dto/customer.dto';

@ApiTags('customers')
@Controller('customers')
export class CustomersController {
  constructor(private readonly getCustomerUseCase: GetCustomerUseCase) {}

  @Get(':id')
  @ApiOperation({
    summary: 'Get a customer by id. This app has no auth layer — email/phone are partially masked.',
  })
  @ApiParam({ name: 'id', description: 'Customer id (UUID v4)' })
  @ApiOkResponse({ type: CustomerResponseDto })
  @ApiBadRequestResponse({ description: 'Malformed id (not a UUID v4)' })
  @ApiNotFoundResponse({ description: 'Customer not found' })
  async getById(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<CustomerResponseDto> {
    const result = await this.getCustomerUseCase.execute(id);

    return result.match(
      (customer) => CustomerResponseDto.fromDomain(customer),
      (error) => {
        throw error;
      },
    );
  }
}
