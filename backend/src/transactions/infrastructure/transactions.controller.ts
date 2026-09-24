import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBadGatewayResponse, ApiConflictResponse, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiParam, ApiTags } from '@nestjs/swagger';

import { CreateTransactionUseCase } from '../application/create-transaction.use-case';
import { GetTransactionUseCase } from '../application/get-transaction.use-case';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { TransactionResponseDto } from './dto/transaction-response.dto';

@ApiTags('transactions')
@Controller('transactions')
export class TransactionsController {
  constructor(
    private readonly createTransactionUseCase: CreateTransactionUseCase,
    private readonly getTransactionUseCase: GetTransactionUseCase,
  ) {}

  @Post()
  @ApiCreatedResponse({ type: TransactionResponseDto })
  @ApiNotFoundResponse({ description: 'Product not found' })
  @ApiConflictResponse({ description: 'Insufficient stock' })
  @ApiBadGatewayResponse({ description: 'Payment gateway unreachable or timed out' })
  async create(@Body() dto: CreateTransactionDto): Promise<TransactionResponseDto> {
    const result = await this.createTransactionUseCase.execute({
      productId: dto.productId,
      quantity: dto.quantity,
      customer: dto.customer,
      delivery: dto.delivery,
      cardToken: dto.cardToken,
      installments: dto.installments,
      acceptanceToken: dto.acceptanceToken,
      acceptPersonalAuth: dto.acceptPersonalAuth,
    });

    return result.match(
      (transaction) => TransactionResponseDto.fromDomain(transaction),
      (error) => {
        throw error;
      },
    );
  }

  @Get(':id')
  @ApiParam({ name: 'id', description: 'Transaction id (UUID v4)' })
  @ApiOkResponse({ type: TransactionResponseDto })
  @ApiNotFoundResponse({ description: 'Transaction not found' })
  async getById(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<TransactionResponseDto> {
    const result = await this.getTransactionUseCase.execute(id);

    return result.match(
      (transaction) => TransactionResponseDto.fromDomain(transaction),
      (error) => {
        throw error;
      },
    );
  }
}
