import bcrypt from 'bcryptjs';

import { BCRYPT_COST_FACTOR, BcryptPasswordHasherAdapter } from './bcrypt-password-hasher.adapter';

describe('BcryptPasswordHasherAdapter', () => {
  describe('hash', () => {
    it('produces a bcrypt hash at the configured cost factor (10)', async () => {
      const adapter = new BcryptPasswordHasherAdapter();

      const hash = await adapter.hash('correct-horse-battery-staple');

      expect(hash).not.toBe('correct-horse-battery-staple');
      expect(bcrypt.getRounds(hash)).toBe(BCRYPT_COST_FACTOR);
    });

    it('produces a different hash for the same input on each call (random salt)', async () => {
      const adapter = new BcryptPasswordHasherAdapter();

      const [first, second] = await Promise.all([
        adapter.hash('same-password'),
        adapter.hash('same-password'),
      ]);

      expect(first).not.toBe(second);
    });
  });

  describe('compare', () => {
    it('returns true when the plaintext matches the hash', async () => {
      const adapter = new BcryptPasswordHasherAdapter();
      const hash = await adapter.hash('my-secret-password');

      await expect(adapter.compare('my-secret-password', hash)).resolves.toBe(true);
    });

    it('returns false when the plaintext does not match the hash', async () => {
      const adapter = new BcryptPasswordHasherAdapter();
      const hash = await adapter.hash('my-secret-password');

      await expect(adapter.compare('wrong-password', hash)).resolves.toBe(false);
    });
  });
});
