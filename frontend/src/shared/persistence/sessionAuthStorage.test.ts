import { AUTH_STORAGE_KEY, clearAuthSession, loadAuthSession, saveAuthSession } from './sessionAuthStorage';

const NOW = new Date('2026-01-01T00:00:00.000Z').getTime();
const ONE_HOUR_MS = 3_600_000;

const SESSION = {
  token: 'jwt.token.value',
  userId: 'u1',
  email: 'jane@example.com',
  fullName: 'Jane Doe',
  expiresAt: NOW + ONE_HOUR_MS,
};

describe('sessionAuthStorage', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('saveAuthSession / loadAuthSession', () => {
    it('returns undefined when nothing is stored', () => {
      expect(loadAuthSession()).toBeUndefined();
    });

    it('round-trips a saved session through sessionStorage', () => {
      saveAuthSession(SESSION);

      expect(loadAuthSession()).toEqual(SESSION);
    });

    it('writes to sessionStorage, never to localStorage', () => {
      saveAuthSession(SESSION);

      expect(sessionStorage.getItem(AUTH_STORAGE_KEY)).toContain(SESSION.token);
      expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
      expect(localStorage.length).toBe(0);
    });

    it('returns undefined and clears storage when the payload is malformed JSON', () => {
      sessionStorage.setItem(AUTH_STORAGE_KEY, '{not json');

      expect(loadAuthSession()).toBeUndefined();
      expect(sessionStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    });

    it('returns undefined and clears storage when the payload is valid JSON but not an object', () => {
      sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify('oops'));

      expect(loadAuthSession()).toBeUndefined();
      expect(sessionStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    });

    it.each<[string, (s: typeof SESSION) => unknown]>([
      ['token is missing', (s) => ({ ...s, token: undefined })],
      ['token is not a string', (s) => ({ ...s, token: 42 })],
      ['userId is not a string', (s) => ({ ...s, userId: 42 })],
      ['email is not a string', (s) => ({ ...s, email: 42 })],
      ['fullName is not a string', (s) => ({ ...s, fullName: 42 })],
      ['expiresAt is missing', (s) => ({ ...s, expiresAt: undefined })],
      ['expiresAt is not a number', (s) => ({ ...s, expiresAt: '2026-01-01' })],
    ])('discards the persisted session and clears storage when %s', (_name, corrupt) => {
      sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(corrupt(SESSION)));

      expect(loadAuthSession()).toBeUndefined();
      expect(sessionStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    });
  });

  describe('session expiry', () => {
    it('discards a session whose expiresAt is already in the past, clearing storage', () => {
      sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ ...SESSION, expiresAt: NOW - 1 }));

      expect(loadAuthSession()).toBeUndefined();
      expect(sessionStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    });

    it('discards a session whose expiresAt is exactly now (treated as expired, not valid)', () => {
      sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ ...SESSION, expiresAt: NOW }));

      expect(loadAuthSession()).toBeUndefined();
    });

    it('keeps a session whose expiresAt is still in the future', () => {
      saveAuthSession(SESSION);

      expect(loadAuthSession()).toEqual(SESSION);
    });

    it('discards a session that has expired while sitting in storage since it was saved', () => {
      saveAuthSession(SESSION);

      jest.setSystemTime(SESSION.expiresAt + 1);

      expect(loadAuthSession()).toBeUndefined();
      expect(sessionStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    });
  });

  describe('clearAuthSession', () => {
    it('removes the storage key entirely', () => {
      saveAuthSession(SESSION);

      clearAuthSession();

      expect(sessionStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    });
  });

  describe('storage failures never crash the app', () => {
    let originalSessionStorage: Storage;

    beforeEach(() => {
      originalSessionStorage = window.sessionStorage;
    });

    afterEach(() => {
      Object.defineProperty(window, 'sessionStorage', { value: originalSessionStorage, configurable: true });
    });

    function throwingStorage(methods: {
      getItem?: () => string | null;
      setItem?: () => void;
      removeItem?: () => void;
    }): Storage {
      return {
        length: 0,
        clear: jest.fn(),
        key: jest.fn(),
        getItem: methods.getItem ?? (() => null),
        setItem: methods.setItem ?? (() => undefined),
        removeItem: methods.removeItem ?? (() => undefined),
      } as unknown as Storage;
    }

    it('does not throw when sessionStorage.setItem throws (e.g. private mode)', () => {
      Object.defineProperty(window, 'sessionStorage', {
        value: throwingStorage({
          setItem: () => {
            throw new DOMException('Access denied', 'SecurityError');
          },
        }),
        configurable: true,
      });

      expect(() => saveAuthSession(SESSION)).not.toThrow();
    });

    it('does not throw and returns undefined when sessionStorage.getItem throws', () => {
      Object.defineProperty(window, 'sessionStorage', {
        value: throwingStorage({
          getItem: () => {
            throw new DOMException('Access denied', 'SecurityError');
          },
        }),
        configurable: true,
      });

      expect(() => loadAuthSession()).not.toThrow();
      expect(loadAuthSession()).toBeUndefined();
    });

    it('does not throw when clearAuthSession is called and removeItem throws', () => {
      Object.defineProperty(window, 'sessionStorage', {
        value: throwingStorage({
          removeItem: () => {
            throw new DOMException('Access denied', 'SecurityError');
          },
        }),
        configurable: true,
      });

      expect(() => clearAuthSession()).not.toThrow();
    });
  });
});
