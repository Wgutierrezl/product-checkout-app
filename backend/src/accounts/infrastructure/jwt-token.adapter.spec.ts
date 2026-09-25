import jwt from 'jsonwebtoken';

import { JwtTokenAdapter } from './jwt-token.adapter';

const SECRET = 'test-jwt-secret-at-least-32-chars-long';

describe('JwtTokenAdapter', () => {
  describe('issue', () => {
    it('issues an HS256 JWT with a 1h expiry carrying sub/email claims', () => {
      const adapter = new JwtTokenAdapter(SECRET);

      const token = adapter.issue({ sub: 'user-1', email: 'jane.doe@example.com' });

      const decoded = jwt.verify(token, SECRET) as jwt.JwtPayload;
      expect(decoded.sub).toBe('user-1');
      expect(decoded.email).toBe('jane.doe@example.com');
      expect(decoded.exp).toBeDefined();
      expect(decoded.iat).toBeDefined();
      expect(decoded.exp! - decoded.iat!).toBe(3600);
      expect(jwt.decode(token, { complete: true })?.header.alg).toBe('HS256');
    });
  });

  describe('verify', () => {
    it('returns the claims when the token is valid', () => {
      const adapter = new JwtTokenAdapter(SECRET);
      const token = adapter.issue({ sub: 'user-1', email: 'jane.doe@example.com' });

      const result = adapter.verify(token);

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toEqual({ sub: 'user-1', email: 'jane.doe@example.com' });
    });

    it('returns UnauthorizedError when the token is expired', () => {
      const adapter = new JwtTokenAdapter(SECRET);
      const expiredToken = jwt.sign({ sub: 'user-1', email: 'jane.doe@example.com' }, SECRET, {
        algorithm: 'HS256',
        expiresIn: -1,
      });

      const result = adapter.verify(expiredToken);

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('Unauthorized');
    });

    it('returns UnauthorizedError when the signature is tampered', () => {
      const adapter = new JwtTokenAdapter(SECRET);
      const token = adapter.issue({ sub: 'user-1', email: 'jane.doe@example.com' });
      const tampered = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`;

      const result = adapter.verify(tampered);

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('Unauthorized');
    });

    it('returns UnauthorizedError for a malformed token', () => {
      const adapter = new JwtTokenAdapter(SECRET);

      const result = adapter.verify('not-a-jwt-at-all');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('Unauthorized');
    });

    it('returns UnauthorizedError when a validly-signed token is missing the email claim', () => {
      const adapter = new JwtTokenAdapter(SECRET);
      const tokenMissingEmail = jwt.sign({ sub: 'user-1' }, SECRET, {
        algorithm: 'HS256',
        expiresIn: '1h',
      });

      const result = adapter.verify(tokenMissingEmail);

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('Unauthorized');
    });

    it('returns UnauthorizedError when the token was signed with a different secret', () => {
      const adapter = new JwtTokenAdapter(SECRET);
      const foreignToken = jwt.sign({ sub: 'user-1', email: 'jane.doe@example.com' }, 'a-different-secret', {
        algorithm: 'HS256',
        expiresIn: '1h',
      });

      const result = adapter.verify(foreignToken);

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('Unauthorized');
    });
  });
});
