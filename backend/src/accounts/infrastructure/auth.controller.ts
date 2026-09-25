import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { LoginUseCase } from '../application/login.use-case';
import { RegisterUseCase } from '../application/register.use-case';
import { LoginDto, LoginResponseDto } from './dto/login.dto';
import { RegisterDto, RegisterResponseDto } from './dto/register.dto';

/**
 * Stricter throttle than the app-wide default (see `AppModule`'s
 * `ThrottlerModule.forRootAsync`): 5 requests per 60s per client, on BOTH
 * register and login — the signed-off brute-force-resistance default (see
 * design's sign-off log). `@nestjs/throttler` keys each counter by
 * controller+handler+client, so this never affects any other route's limit.
 */
const AUTH_THROTTLE = { default: { limit: 5, ttl: 60_000 } };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly registerUseCase: RegisterUseCase,
    private readonly loginUseCase: LoginUseCase,
  ) {}

  @Throttle(AUTH_THROTTLE)
  @Post('register')
  @ApiOperation({ summary: 'Register a new account.' })
  @ApiCreatedResponse({ type: RegisterResponseDto, description: 'Account created — no password/hash returned.' })
  @ApiConflictResponse({ description: 'A user with this email already exists' })
  @ApiTooManyRequestsResponse({ description: 'Rate limit exceeded (5 requests / 60s per client)' })
  async register(@Body() dto: RegisterDto): Promise<RegisterResponseDto> {
    const result = await this.registerUseCase.execute({
      fullName: dto.fullName,
      email: dto.email,
      password: dto.password,
    });

    return result.match(
      (user) => RegisterResponseDto.fromDomain(user),
      (error) => {
        throw error;
      },
    );
  }

  @Throttle(AUTH_THROTTLE)
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Log in and receive a JWT access token (~1h expiry, no refresh token).' })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password (no detail on which one is wrong)' })
  @ApiTooManyRequestsResponse({ description: 'Rate limit exceeded (5 requests / 60s per client)' })
  async login(@Body() dto: LoginDto): Promise<LoginResponseDto> {
    const result = await this.loginUseCase.execute({ email: dto.email, password: dto.password });

    return result.match(
      ({ accessToken }) => LoginResponseDto.fromToken(accessToken),
      (error) => {
        throw error;
      },
    );
  }
}
