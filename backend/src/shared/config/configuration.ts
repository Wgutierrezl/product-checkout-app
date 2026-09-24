import { EnvironmentVariables, validateEnv } from './env.validation';

export interface AppConfig {
  nodeEnv: string;
  port: number;
  paymentGateway: {
    url: string;
    publicKey: string;
    privateKey: string;
    integritySecret: string;
    eventsSecret: string;
    timeoutMs: number;
  };
  aws: {
    region: string;
    dynamoEndpoint?: string;
  };
  fees: {
    baseFeeCents: number;
    deliveryFeeCents: number;
  };
  lazyPollThresholdMs: number;
  cors: {
    allowedOrigins: string[];
  };
  throttle: {
    ttl: number;
    limit: number;
  };
}

/**
 * Reshapes an already-validated `EnvironmentVariables` instance into the nested
 * `AppConfig` structure the rest of the app depends on. `env.validation.ts` is the
 * single source of truth for defaults and validation rules — this function must
 * NOT re-implement or loosen any of them, only map fields.
 */
export default function configuration(
  env: EnvironmentVariables = validateEnv(process.env),
): AppConfig {
  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    paymentGateway: {
      url: env.PAYMENT_GATEWAY_URL,
      publicKey: env.PAYMENT_GATEWAY_PUBLIC_KEY,
      privateKey: env.PAYMENT_GATEWAY_PRIVATE_KEY,
      integritySecret: env.PAYMENT_GATEWAY_INTEGRITY_SECRET,
      eventsSecret: env.PAYMENT_GATEWAY_EVENTS_SECRET,
      timeoutMs: env.PAYMENT_GATEWAY_TIMEOUT_MS,
    },
    aws: {
      region: env.AWS_REGION,
      dynamoEndpoint: env.DYNAMO_ENDPOINT,
    },
    fees: {
      baseFeeCents: env.BASE_FEE_CENTS,
      deliveryFeeCents: env.DELIVERY_FEE_CENTS,
    },
    lazyPollThresholdMs: env.LAZY_POLL_THRESHOLD_MS,
    cors: {
      allowedOrigins: env.CORS_ALLOWED_ORIGINS.split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    },
    throttle: {
      ttl: env.THROTTLE_TTL,
      limit: env.THROTTLE_LIMIT,
    },
  };
}
