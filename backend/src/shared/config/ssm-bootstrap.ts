import { GetParametersCommand, SSMClient } from '@aws-sdk/client-ssm';

const SECRET_SUFFIX_TO_ENV_VAR: Record<string, string> = {
  'private-key': 'PAYMENT_GATEWAY_PRIVATE_KEY',
  'integrity-secret': 'PAYMENT_GATEWAY_INTEGRITY_SECRET',
  'events-secret': 'PAYMENT_GATEWAY_EVENTS_SECRET',
  // Accounts module's JWT signing secret (user-accounts) — same batch/prefix
  // as the payment-gateway secrets, no new IAM action (see api-stack.ts).
  'jwt-secret': 'ACCOUNTS_JWT_SECRET',
};

/**
 * Fetches the 3 payment-gateway secrets plus the accounts module's JWT
 * signing secret (4 total) — all SecureString params under the same
 * `SSM_PARAM_PREFIX` — from SSM Parameter Store once, at Lambda cold start,
 * and populates them as env vars before Nest's `ConfigModule.forRoot` (and
 * its `validateSync`) run.
 *
 * No-op when `SSM_PARAM_PREFIX` is unset — local/dev pulls secrets from
 * `.env` instead, untouched by this function.
 *
 * Fails fast (throws before Nest bootstraps) if any of the 4 parameters is
 * missing or unreadable, and never logs a secret value.
 */
export async function loadSecretsFromSsm(): Promise<void> {
  const prefix = process.env.SSM_PARAM_PREFIX;
  if (!prefix) return;

  const suffixes = Object.keys(SECRET_SUFFIX_TO_ENV_VAR);
  const names = suffixes.map((suffix) => `${prefix}/${suffix}`);

  const client = new SSMClient({});
  const { Parameters, InvalidParameters } = await client.send(
    new GetParametersCommand({ Names: names, WithDecryption: true }),
  );

  if (InvalidParameters && InvalidParameters.length > 0) {
    throw new Error(`Missing SSM parameters: ${InvalidParameters.join(', ')}`);
  }

  // Parameters always match one of the requested `names` — GetParametersCommand
  // only returns entries it found, and unmatched/invalid ones are already
  // reported (and thrown on) via InvalidParameters above.
  for (const parameter of Parameters!) {
    const suffix = parameter.Name!.slice(prefix.length + 1);
    process.env[SECRET_SUFFIX_TO_ENV_VAR[suffix]] = parameter.Value!;
  }
}
