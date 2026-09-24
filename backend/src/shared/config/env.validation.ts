import { plainToInstance } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  validateSync,
} from 'class-validator';

export class EnvironmentVariables {
  @IsOptional()
  @IsIn(['development', 'production', 'test'])
  NODE_ENV: string = 'development';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65_535)
  PORT: number = 3000;

  @IsNotEmpty()
  @IsUrl({ require_tld: false })
  PAYMENT_GATEWAY_URL!: string;

  @IsNotEmpty()
  @IsString()
  PAYMENT_GATEWAY_PUBLIC_KEY!: string;

  @IsNotEmpty()
  @IsString()
  PAYMENT_GATEWAY_PRIVATE_KEY!: string;

  @IsNotEmpty()
  @IsString()
  PAYMENT_GATEWAY_INTEGRITY_SECRET!: string;

  @IsNotEmpty()
  @IsString()
  PAYMENT_GATEWAY_EVENTS_SECRET!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  PAYMENT_GATEWAY_TIMEOUT_MS: number = 8000;

  @IsNotEmpty()
  @IsString()
  CORS_ALLOWED_ORIGINS!: string;

  @IsOptional()
  @IsString()
  AWS_REGION: string = 'us-east-1';

  @IsOptional()
  @IsString()
  DYNAMO_ENDPOINT?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  BASE_FEE_CENTS: number = 250_000;

  @IsOptional()
  @IsInt()
  @Min(0)
  DELIVERY_FEE_CENTS: number = 800_000;

  @IsOptional()
  @IsInt()
  @Min(0)
  LAZY_POLL_THRESHOLD_MS: number = 3000;

  /**
   * How long a PENDING transaction with no gatewayTransactionId (an
   * ambiguous synchronous charge failure) is allowed to age before
   * poll-by-reference confirming no gateway record exists is enough to mark
   * it ERROR. Default 10 minutes — generous enough to never race a
   * legitimately-slow but real charge.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  RECONCILIATION_WINDOW_MS: number = 600_000;

  @IsOptional()
  @IsInt()
  @Min(1)
  THROTTLE_TTL: number = 60;

  @IsOptional()
  @IsInt()
  @Min(1)
  THROTTLE_LIMIT: number = 10;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    // class-validator always attaches `constraints` for property-level errors on a
    // flat class like this one (no nested/array validation), so this is never undefined.
    const messages = errors
      .map((error) => Object.values(error.constraints!).join(', '))
      .join('; ');
    throw new Error(`Invalid environment configuration: ${messages}`);
  }

  return validated;
}
