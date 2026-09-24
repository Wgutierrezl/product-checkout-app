export interface AppConfig {
  nodeEnv: string;
  port: number;
  paymentGateway: {
    url: string;
    publicKey: string;
    privateKey: string;
    integritySecret: string;
    eventsSecret: string;
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

export default function configuration(): AppConfig {
  const env = process.env;

  return {
    nodeEnv: env.NODE_ENV ?? 'development',
    port: Number(env.PORT ?? 3000),
    paymentGateway: {
      url: env.PAYMENT_GATEWAY_URL ?? '',
      publicKey: env.PAYMENT_GATEWAY_PUBLIC_KEY ?? '',
      privateKey: env.PAYMENT_GATEWAY_PRIVATE_KEY ?? '',
      integritySecret: env.PAYMENT_GATEWAY_INTEGRITY_SECRET ?? '',
      eventsSecret: env.PAYMENT_GATEWAY_EVENTS_SECRET ?? '',
    },
    aws: {
      region: env.AWS_REGION ?? 'us-east-1',
      dynamoEndpoint: env.DYNAMO_ENDPOINT,
    },
    fees: {
      baseFeeCents: Number(env.BASE_FEE_CENTS ?? 250_000),
      deliveryFeeCents: Number(env.DELIVERY_FEE_CENTS ?? 800_000),
    },
    lazyPollThresholdMs: Number(env.LAZY_POLL_THRESHOLD_MS ?? 3000),
    cors: {
      allowedOrigins: (env.CORS_ALLOWED_ORIGINS ?? '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    },
    throttle: {
      ttl: Number(env.THROTTLE_TTL ?? 60),
      limit: Number(env.THROTTLE_LIMIT ?? 10),
    },
  };
}
