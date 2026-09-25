import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

import { ACCOUNTS_JWT_EXPIRES_IN_SECONDS } from '../../../auth/infrastructure/jwt-token.adapter';
import { User } from '../../domain/user.entity';

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

  @ApiProperty({ example: 'e1a6b6b0-6c9e-4a3a-9c1a-6f6f2b6b1a10' })
  userId!: string;

  @ApiProperty({ example: 'jane.doe@example.com' })
  email!: string;

  @ApiProperty({ example: 'Jane Doe' })
  fullName!: string;

  /**
   * Flat shape (userId/email/fullName alongside the token) so a client can
   * render the logged-in user's name without decoding the JWT payload
   * itself. Built from `LoginUseCase`'s `user` — never includes
   * `passwordHash` (or any other field off `User`).
   */
  static from(accessToken: string, user: Pick<User, 'id' | 'email' | 'fullName'>): LoginResponseDto {
    const dto = new LoginResponseDto();
    dto.accessToken = accessToken;
    dto.tokenType = 'Bearer';
    dto.expiresIn = ACCOUNTS_JWT_EXPIRES_IN_SECONDS;
    dto.userId = user.id;
    dto.email = user.email;
    dto.fullName = user.fullName;
    return dto;
  }
}
