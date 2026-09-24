import { plainToInstance } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min, validateSync } from 'class-validator';

export class EnvironmentVariables {
  @IsOptional()
  @IsIn(['development', 'production', 'test'])
  NODE_ENV: string = 'development';

  @IsOptional()
  @IsInt()
  PORT: number = 3000;

  @IsString()
  PAYMENT_GATEWAY_URL!: string;

  @IsString()
  PAYMENT_GATEWAY_PUBLIC_KEY!: string;

  @IsString()
  PAYMENT_GATEWAY_PRIVATE_KEY!: string;

  @IsString()
  PAYMENT_GATEWAY_INTEGRITY_SECRET!: string;

  @IsString()
  PAYMENT_GATEWAY_EVENTS_SECRET!: string;

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
