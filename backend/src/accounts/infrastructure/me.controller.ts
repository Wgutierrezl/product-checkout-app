import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';

import { GetMeUseCase } from '../application/get-me.use-case';
import { ListMyTransactionsUseCase } from '../application/list-my-transactions.use-case';
import { UpdatePreferencesUseCase } from '../application/update-preferences.use-case';
import { MeResponseDto, TransactionHistoryItemDto, UpdatePreferencesDto } from './dto/me.dto';
import { JwtAuthGuard, RequestWithUserId } from './guards/jwt-auth.guard';

/**
 * Both routes require a valid `Authorization: Bearer <jwt>` — unlike
 * `POST /transactions` (PR6's `OptionalJwtAuthGuard`), these are account
 * routes: missing/expired/tampered tokens are a hard 401, never a silent
 * fallback (see spec's Authenticated Access Guard requirement).
 */
@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(
    private readonly getMeUseCase: GetMeUseCase,
    private readonly updatePreferencesUseCase: UpdatePreferencesUseCase,
    private readonly listMyTransactionsUseCase: ListMyTransactionsUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: "Get the authenticated user's profile and preferences. Never returns password/hash." })
  @ApiOkResponse({ type: MeResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing, expired, or tampered Bearer token' })
  async getMe(@Req() request: RequestWithUserId): Promise<MeResponseDto> {
    const result = await this.getMeUseCase.execute(request.userId!);

    return result.match(
      (user) => MeResponseDto.fromDomain(user),
      (error) => {
        throw error;
      },
    );
  }

  @Put('preferences')
  @ApiOperation({
    summary:
      'Replace the delivery/customer preferences ("remember for next time") on the authenticated user. ' +
      'Field validation mirrors the checkout DTOs exactly, so a saved preference is always valid checkout input.',
  })
  @ApiOkResponse({ type: MeResponseDto, description: 'Updated profile, reflecting the new preferences.' })
  @ApiUnauthorizedResponse({ description: 'Missing, expired, or tampered Bearer token' })
  async updatePreferences(
    @Req() request: RequestWithUserId,
    @Body() dto: UpdatePreferencesDto,
  ): Promise<MeResponseDto> {
    const result = await this.updatePreferencesUseCase.execute({
      userId: request.userId!,
      preferences: {
        phone: dto.phone,
        address: dto.address,
        city: dto.city,
        region: dto.region,
        postalCode: dto.postalCode,
      },
    });

    return result.match(
      (user) => MeResponseDto.fromDomain(user),
      (error) => {
        throw error;
      },
    );
  }

  @Get('transactions')
  @ApiOperation({
    summary:
      "List the authenticated user's own purchase history (newest first, capped at the latest 50), " +
      'joined with each product name and — once APPROVED — the full, unmasked delivery.',
  })
  @ApiOkResponse({ type: [TransactionHistoryItemDto] })
  @ApiUnauthorizedResponse({ description: 'Missing, expired, or tampered Bearer token' })
  async getMyTransactions(@Req() request: RequestWithUserId): Promise<TransactionHistoryItemDto[]> {
    const result = await this.listMyTransactionsUseCase.execute(request.userId!);

    return result.match(
      (items) => items.map((item) => TransactionHistoryItemDto.fromDomain(item)),
      (error) => {
        throw error;
      },
    );
  }
}
