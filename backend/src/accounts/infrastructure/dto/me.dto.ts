import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

import { User, UserPreferences } from '../../domain/user.entity';

/**
 * Mirrors `CreateTransactionCustomerDto`/`CreateTransactionDeliveryDto`'s
 * validation rules EXACTLY (see `create-transaction.dto.ts`) so a saved
 * preference is always valid checkout input — `fullName`/`email` are
 * deliberately NOT part of preferences (they already live on the account
 * itself, see `MeResponseDto`). PUT semantics: every field except
 * `postalCode` is required, matching the checkout form's own requiredness.
 */
export class UpdatePreferencesDto {
  @ApiProperty({ example: '+573001234567' })
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @ApiProperty({ example: 'Cra 1 # 2-3' })
  @IsString()
  @IsNotEmpty()
  address!: string;

  @ApiProperty({ example: 'Bogota' })
  @IsString()
  @IsNotEmpty()
  city!: string;

  @ApiProperty({ example: 'Cundinamarca' })
  @IsString()
  @IsNotEmpty()
  region!: string;

  @ApiPropertyOptional({ example: '110111' })
  @IsOptional()
  @IsString()
  postalCode?: string;
}

export class UserPreferencesDto {
  @ApiPropertyOptional({ example: '+573001234567' })
  phone?: string;

  @ApiPropertyOptional({ example: 'Cra 1 # 2-3' })
  address?: string;

  @ApiPropertyOptional({ example: 'Bogota' })
  city?: string;

  @ApiPropertyOptional({ example: 'Cundinamarca' })
  region?: string;

  @ApiPropertyOptional({ example: '110111' })
  postalCode?: string;

  static fromDomain(preferences: UserPreferences): UserPreferencesDto {
    const dto = new UserPreferencesDto();
    dto.phone = preferences.phone;
    dto.address = preferences.address;
    dto.city = preferences.city;
    dto.region = preferences.region;
    dto.postalCode = preferences.postalCode;
    return dto;
  }
}

export class MeResponseDto {
  @ApiProperty({ example: 'e1a6b6b0-6c9e-4a3a-9c1a-6f6f2b6b1a10' })
  userId!: string;

  @ApiProperty({ example: 'jane.doe@example.com' })
  email!: string;

  @ApiProperty({ example: 'Jane Doe' })
  fullName!: string;

  @ApiPropertyOptional({ type: UserPreferencesDto, description: 'Absent until the first PUT /me/preferences.' })
  preferences?: UserPreferencesDto;

  /**
   * Built from a `Pick` of `User`'s public fields — `passwordHash` is never
   * even a parameter type here, so it structurally cannot leak (same
   * discipline as `RegisterResponseDto.fromDomain`/`LoginResponseDto.from`).
   */
  static fromDomain(user: Pick<User, 'id' | 'email' | 'fullName' | 'preferences'>): MeResponseDto {
    const dto = new MeResponseDto();
    dto.userId = user.id;
    dto.email = user.email;
    dto.fullName = user.fullName;
    dto.preferences = user.preferences ? UserPreferencesDto.fromDomain(user.preferences) : undefined;
    return dto;
  }
}
