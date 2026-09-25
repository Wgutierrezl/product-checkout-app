import { Type } from 'class-transformer';
import { IsArray, IsDefined, IsInt, IsObject, IsString, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

import { WebhookEventPayload, WebhookSignature } from '../../../shared/payment-gateway/domain/webhook-checksum';

export class WebhookSignatureDto implements WebhookSignature {
  @ApiProperty({ example: ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'] })
  @IsArray()
  @IsString({ each: true })
  properties!: string[];

  @ApiProperty({ example: 'e303adc5f336db4d3dc93f0d4364f6311cb2dd981d1764b918443f828eeb7e5b' })
  @IsString()
  checksum!: string;
}

/**
 * Deliberately does NOT deep-validate `data` — the whole point of
 * `signature.properties` is that the set of fields that matter varies per
 * event type and must never be hardcoded (see `verifyWebhookChecksum`).
 * `@IsObject()` keeps `data` intact under the global `ValidationPipe`'s
 * `whitelist: true` (only top-level undecorated properties get stripped;
 * this property's own nested content is untouched).
 */
export class WebhookEventDto implements WebhookEventPayload {
  @ApiProperty({ example: 'transaction.updated' })
  @IsString()
  event!: string;

  @ApiProperty({ example: { transaction: { id: 'gw-tx-1', status: 'APPROVED' } } })
  @IsObject()
  data!: Record<string, unknown>;

  @ApiProperty({ example: 'test' })
  @IsString()
  environment!: string;

  @ApiProperty({ type: WebhookSignatureDto })
  // Without `@IsDefined()`, `@ValidateNested()` skips a missing signature.
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => WebhookSignatureDto)
  signature!: WebhookSignatureDto;

  @ApiProperty({ example: 1_700_000_000 })
  @IsInt()
  timestamp!: number;

  @ApiProperty({ example: '2023-11-14T22:13:20.000Z' })
  @IsString()
  sent_at!: string;
}
