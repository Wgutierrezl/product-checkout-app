import { Controller, Get } from '@nestjs/common';
import { ApiBadGatewayResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { GetPaymentAcceptanceUseCase } from '../application/get-payment-acceptance.use-case';
import { PaymentAcceptanceResponseDto } from './dto/payment-acceptance.dto';

@ApiTags('payment-acceptance')
@Controller('payment-acceptance')
export class PaymentAcceptanceController {
  constructor(private readonly getPaymentAcceptanceUseCase: GetPaymentAcceptanceUseCase) {}

  @Get()
  @ApiOkResponse({ type: PaymentAcceptanceResponseDto })
  @ApiBadGatewayResponse({ description: 'Payment gateway unreachable or timed out' })
  async get(): Promise<PaymentAcceptanceResponseDto> {
    const result = await this.getPaymentAcceptanceUseCase.execute();

    return result.match(
      (tokens) => PaymentAcceptanceResponseDto.fromDomain(tokens),
      (error) => {
        throw error;
      },
    );
  }
}
