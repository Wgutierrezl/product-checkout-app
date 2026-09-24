import { ApiProperty } from '@nestjs/swagger';

import { AcceptanceTokens } from '../../../shared/payment-gateway/domain/payment-gateway.types';

export class PaymentAcceptanceResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiJ9.eyJ...' })
  acceptanceToken!: string;

  @ApiProperty({ example: 'https://gateway.test/acceptance-terms' })
  acceptanceTokenPermalink!: string;

  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiJ9.eyJ...' })
  acceptPersonalAuth!: string;

  @ApiProperty({ example: 'https://gateway.test/personal-data-auth-terms' })
  acceptPersonalAuthPermalink!: string;

  static fromDomain(tokens: AcceptanceTokens): PaymentAcceptanceResponseDto {
    const dto = new PaymentAcceptanceResponseDto();
    dto.acceptanceToken = tokens.acceptanceToken.token;
    dto.acceptanceTokenPermalink = tokens.acceptanceToken.permalink;
    dto.acceptPersonalAuth = tokens.acceptPersonalAuth.token;
    dto.acceptPersonalAuthPermalink = tokens.acceptPersonalAuth.permalink;
    return dto;
  }
}
