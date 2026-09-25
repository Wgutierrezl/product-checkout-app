/**
 * Resolves the DynamoDB endpoint the E2E suite runs against. The suite DROPS
 * every table it touches (see `dynamo-e2e.support.ts`), so it must never
 * point at the developer's own DynamoDB Local (`docker compose up`, port
 * 8000). It reads only `E2E_DYNAMO_ENDPOINT`, never the app's
 * `DYNAMO_ENDPOINT`, and refuses to run against port 8000 at all.
 *
 * Deliberately dependency-free: `checkout.e2e-spec.ts` calls it before
 * `AppModule` is imported, while it is still setting `process.env`.
 */
export const DEFAULT_E2E_DYNAMO_ENDPOINT = 'http://localhost:8001';

const DEV_DYNAMO_PORT = '8000';

export function resolveE2eDynamoEndpoint(env: NodeJS.ProcessEnv): string {
  const endpoint = env.E2E_DYNAMO_ENDPOINT ?? DEFAULT_E2E_DYNAMO_ENDPOINT;

  let port: string;
  try {
    port = new URL(endpoint).port;
  } catch {
    throw new Error(`E2E_DYNAMO_ENDPOINT must be a URL such as ${DEFAULT_E2E_DYNAMO_ENDPOINT}, got "${endpoint}".`);
  }

  if (port === DEV_DYNAMO_PORT) {
    throw new Error(
      `Refusing to run the E2E suite: E2E_DYNAMO_ENDPOINT (${endpoint}) uses port ${DEV_DYNAMO_PORT}, ` +
        'where the development DynamoDB Local listens, and the suite drops every table. Start a separate ' +
        'instance, e.g. `docker run -d --rm -p 8001:8000 --name checkout-dynamodb-e2e amazon/dynamodb-local`.',
    );
  }

  return endpoint;
}
