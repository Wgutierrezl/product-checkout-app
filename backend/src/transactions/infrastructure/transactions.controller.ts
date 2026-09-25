import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBadGatewayResponse, ApiBadRequestResponse, ApiConflictResponse, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';

import { CreateTransactionUseCase } from '../application/create-transaction.use-case';
import { GetTransactionUseCase } from '../application/get-transaction.use-case';
import { HandleWebhookUseCase } from '../application/handle-webhook.use-case';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { TransactionResponseDto } from './dto/transaction-response.dto';
import { WebhookEventDto } from './dto/webhook-event.dto';

@ApiTags('transactions')
@Controller('transactions')
export class TransactionsController {
  constructor(
    private readonly createTransactionUseCase: CreateTransactionUseCase,
    private readonly getTransactionUseCase: GetTransactionUseCase,
    private readonly handleWebhookUseCase: HandleWebhookUseCase,
  ) {}

  @Post()
  @ApiOperation({
    summary:
      'Create a checkout transaction. Price is always computed server-side; the gateway is called ' +
      'synchronously with the server-computed amount.',
  })
  @ApiCreatedResponse({
    type: TransactionResponseDto,
    description:
      'Always 201, including on an idempotent replay: submitting the same ' +
      'idempotencyKey again returns the original transaction unchanged and ' +
      'never calls the gateway a second time.',
  })
  @ApiBadRequestResponse({ description: 'Validation failed (missing/invalid field, or an unknown extra field)' })
  @ApiNotFoundResponse({ description: 'Product not found' })
  @ApiConflictResponse({ description: 'Insufficient stock' })
  @ApiBadGatewayResponse({ description: 'Payment gateway unreachable or timed out' })
  async create(@Body() dto: CreateTransactionDto): Promise<TransactionResponseDto> {
    const result = await this.createTransactionUseCase.execute({
      idempotencyKey: dto.idempotencyKey,
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
      (view) => TransactionResponseDto.fromDomain(view.transaction, view.delivery),
      (error) => {
        throw error;
      },
    );
  }

  /**
   * Dedicated, higher throttle limit for this route's own counter (see
   * `AppModule`'s `ThrottlerModule.forRootAsync`; @nestjs/throttler keys
   * each counter by controller+handler+client, so this override does NOT
   * affect any other route's limit): the SPA polls GET /transactions/:id on
   * a 1s→5s linear backoff for up to 60s (~16 requests) while a payment
   * settles, which alone exceeded the old global default of 10 per 60s. Not
   * `@SkipThrottle()` — still bounded, just wide enough that a real buyer
   * waiting for their payment never gets 429'd.
   *
   * `ttl` here is in MILLISECONDS (the decorator's raw unit, unlike
   * `THROTTLE_TTL`'s seconds in env/configuration.ts, which App Module
   * converts to ms before registering the module-level throttler).
   */
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get(':id')
  @ApiOperation({
    summary: 'Get a transaction by id, self-healing a stale PENDING status via a lazy poll of the gateway.',
  })
  @ApiParam({ name: 'id', description: 'Transaction id (UUID v4)' })
  @ApiOkResponse({
    type: TransactionResponseDto,
    description:
      'A stale PENDING transaction is refreshed against the payment gateway before responding ' +
      '(lazy poll). The delivery is embedded once the transaction is APPROVED.',
  })
  @ApiBadRequestResponse({ description: 'Malformed id (not a UUID v4)' })
  @ApiNotFoundResponse({ description: 'Transaction not found' })
  async getById(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<TransactionResponseDto> {
    const result = await this.getTransactionUseCase.execute(id);

    return result.match(
      (view) => TransactionResponseDto.fromDomain(view.transaction, view.delivery),
      (error) => {
        throw error;
      },
    );
  }

  /**
   * Exempt from throttling (`@SkipThrottle`): the payment gateway, not an
   * end user, calls this endpoint, and legitimate retries under load must
   * never be rate-limited away. Checksum verification (`HandleWebhookUseCase`)
   * is the actual security boundary here, not the throttler.
   *
   * Always responds 200 for ANY checksum-valid payload — including unknown
   * or already-final transactions — so the gateway's webhook delivery is
   * never retried needlessly; only an invalid checksum is rejected (400).
   */
  @Post('webhook')
  @SkipThrottle()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Payment gateway webhook. Checksum-verified server-side; never rate-limited.',
  })
  @ApiOkResponse({
    description:
      'Always 200 for a checksum-valid payload, including unknown or already-final transactions (idempotent).',
  })
  @ApiBadRequestResponse({ description: 'Invalid webhook checksum' })
  async webhook(@Body() payload: WebhookEventDto): Promise<{ received: true }> {
    const result = await this.handleWebhookUseCase.execute(payload);

    return result.match(
      () => ({ received: true as const }),
      (error) => {
        throw error;
      },
    );
  }
}
