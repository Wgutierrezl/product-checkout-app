import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'Jane Doe' })
  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @ApiProperty({ example: 'jane.doe@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'correct-horse-battery-staple', minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;
}

export class RegisterResponseDto {
  @ApiProperty({ example: 'e1a6b6b0-6c9e-4a3a-9c1a-6f6f2b6b1a10' })
  userId!: string;

  @ApiProperty({ example: 'Jane Doe' })
  fullName!: string;

  @ApiProperty({ example: 'jane.doe@example.com' })
  email!: string;

  static fromDomain(user: { id: string; fullName: string; email: string }): RegisterResponseDto {
    const dto = new RegisterResponseDto();
    dto.userId = user.id;
    dto.fullName = user.fullName;
    dto.email = user.email;
    return dto;
  }
}
