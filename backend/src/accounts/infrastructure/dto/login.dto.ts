import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

import { ACCOUNTS_JWT_EXPIRES_IN_SECONDS } from '../jwt-token.adapter';

export class LoginDto {
  @ApiProperty({ example: 'jane.doe@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'correct-horse-battery-staple' })
  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class LoginResponseDto {
  @ApiProperty({ description: 'JWT access token, HS256, ~1h expiry. No refresh token is issued.' })
  accessToken!: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType!: 'Bearer';

  @ApiProperty({ example: ACCOUNTS_JWT_EXPIRES_IN_SECONDS, description: 'Token lifetime in seconds' })
  expiresIn!: number;

  static fromToken(accessToken: string): LoginResponseDto {
    const dto = new LoginResponseDto();
    dto.accessToken = accessToken;
    dto.tokenType = 'Bearer';
    dto.expiresIn = ACCOUNTS_JWT_EXPIRES_IN_SECONDS;
    return dto;
  }
}
