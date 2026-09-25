import { AppResult } from '../../../shared/result/result.types';

export interface TokenClaims {
  /** Subject — the user id. */
  sub: string;
  email: string;
}

/**
 * Thin port around JWT issuance/verification (jsonwebtoken in production,
 * see `jwt-token.adapter.ts`, added in PR3). `issue` is infallible for valid
 * claims (sync, plain string return, mirrors `IdGeneratorPort`); `verify`
 * returns an `AppResult` because an invalid/expired/tampered token is a
 * domain-meaningful failure the caller (the auth guard) must react to.
 */
export interface TokenPort {
  issue(claims: TokenClaims): string;
  verify(token: string): AppResult<TokenClaims>;
}

export const TOKEN_PORT = Symbol('TOKEN_PORT');
