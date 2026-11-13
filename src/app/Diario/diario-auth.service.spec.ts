import { vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  legacy: new Map<string, string>(),
  events: [] as string[],
  record: null as null | {
    salt: string;
    hash: string;
    iterations: number;
    failedAttempts: number;
    alarmActive: boolean;
  },
  state: { failedAttempts: 0, alarmActive: false },
  storage: {
    initialize: vi.fn(),
    getSecurityRecord: vi.fn(),
    getSecurityState: vi.fn(),
    saveSecurityRecord: vi.fn(),
    saveSecurityState: vi.fn(),
    setSessionUnlocked: vi.fn(),
  },
}));

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(async ({ key }: { key: string }) => ({ value: mocks.legacy.get(key) ?? null })),
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => {
      mocks.legacy.set(key, value);
    }),
    remove: vi.fn(async ({ key }: { key: string }) => {
      mocks.events.push(`remove:${key}`);
      mocks.legacy.delete(key);
    }),
  },
}));
vi.mock('@capacitor/haptics', () => ({
  Haptics: { vibrate: vi.fn().mockResolvedValue(undefined) },
}));

import { DiarioAuthService } from './diario-auth.service';

function createTestCrypto(): Crypto {
  return {
    getRandomValues<T extends ArrayBufferView | null>(array: T): T {
      if (array instanceof Uint8Array) array.forEach((_value, index) => (array[index] = index + 1));
      return array;
    },
    subtle: {
      importKey: vi.fn(async (_format, keyData) => new TextDecoder().decode(keyData as BufferSource)) as never,
      deriveBits: vi.fn(async (algorithm, key) => {
        const salt = Array.from(algorithm.salt as Uint8Array).join(',');
        const input = new TextEncoder().encode(`${String(key)}|${salt}|${algorithm.iterations}`);
        const bytes = new Uint8Array(32);
        for (let index = 0; index < bytes.length; index++) {
          bytes[index] = input[index % input.length] ^ ((index * 31) & 0xff);
        }
        return bytes.buffer;
      }) as never,
    } as unknown as SubtleCrypto,
  } as unknown as Crypto;
}

const testCrypto = createTestCrypto();

async function pinHash(pin: string, salt: string, iterations = 150_000): Promise<string> {
  const key = await testCrypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const result = await testCrypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: Uint8Array.from(atob(salt), (character) => character.charCodeAt(0)),
      iterations,
      hash: 'SHA-256',
    },
    key,
    256,
  );
  return btoa(String.fromCharCode(...new Uint8Array(result)));
}

describe('DiarioAuthService', () => {
  let auth: DiarioAuthService;

  beforeEach(() => {
    vi.stubGlobal('crypto', testCrypto);
    mocks.legacy.clear();
    mocks.events.length = 0;
    mocks.record = null;
    mocks.state = { failedAttempts: 0, alarmActive: false };
    vi.clearAllMocks();
    mocks.storage.initialize.mockResolvedValue(undefined);
    mocks.storage.getSecurityRecord.mockImplementation(async () => mocks.record);
    mocks.storage.getSecurityState.mockImplementation(async () => mocks.state);
    mocks.storage.saveSecurityRecord.mockImplementation(async (record) => {
      mocks.events.push('save-secure-record');
      mocks.record = record as typeof mocks.record;
    });
    mocks.storage.saveSecurityState.mockImplementation(async (failedAttempts, alarmActive) => {
      mocks.state = { failedAttempts, alarmActive };
    });
    auth = new DiarioAuthService(mocks.storage as never);
  });

  afterEach(() => {
    auth.lock();
    vi.unstubAllGlobals();
  });

  it('keeps the old PIN if secure migration fails and refuses access', async () => {
    const salt = btoa('salt-for-migration');
    mocks.legacy.set('diario_pin_salt', salt);
    mocks.legacy.set('diario_pin_hash', await pinHash('2468', salt));
    mocks.storage.saveSecurityRecord.mockRejectedValueOnce(new Error('Keystore indisponível'));

    const message = await auth.unlock('2468');

    expect(message).toContain('PIN antigo não será removido');
    expect(mocks.legacy.has('diario_pin_salt')).toBe(true);
    expect(mocks.legacy.has('diario_pin_hash')).toBe(true);
    expect(mocks.storage.setSessionUnlocked).not.toHaveBeenCalledWith(true);
    expect(auth.authenticated()).toBe(false);
  });

  it('removes the legacy PIN only after writing and validating its secure copy', async () => {
    const salt = btoa('another-salt');
    mocks.legacy.set('diario_pin_salt', salt);
    mocks.legacy.set('diario_pin_hash', await pinHash('2468', salt));
    mocks.storage.getSecurityRecord.mockImplementation(async () => {
      mocks.events.push('read-secure-record');
      return mocks.record;
    });

    const message = await auth.unlock('2468');

    expect(message).toBeNull();
    const savedAt = mocks.events.indexOf('save-secure-record');
    const validatedAt = mocks.events.lastIndexOf('read-secure-record');
    const removedAt = mocks.events.indexOf('remove:diario_pin_salt');
    expect(savedAt).toBeGreaterThanOrEqual(0);
    expect(savedAt).toBeLessThan(validatedAt);
    expect(validatedAt).toBeLessThan(removedAt);
    expect(mocks.legacy.has('diario_pin_salt')).toBe(false);
    expect(mocks.legacy.has('diario_pin_hash')).toBe(false);
    expect(auth.authenticated()).toBe(true);
    expect(mocks.storage.setSessionUnlocked).toHaveBeenCalledWith(true);
  });

  it('persists three failed attempts and keeps the diary locked until the correct PIN', async () => {
    const salt = btoa('stored-pin-salt');
    mocks.record = {
      salt,
      hash: await pinHash('1357', salt, 600_000),
      iterations: 600_000,
      failedAttempts: 0,
      alarmActive: false,
    };

    expect(await auth.unlock('0000')).toContain('PIN incorreto');
    expect(await auth.unlock('0000')).toContain('Resta uma tentativa');
    expect(await auth.unlock('0000')).toContain('Alarme ativado');
    expect(mocks.storage.saveSecurityState).toHaveBeenLastCalledWith(3, true);
    expect(auth.authenticated()).toBe(false);

    expect(await auth.unlock('1357')).toBeNull();
    expect(mocks.storage.saveSecurityState).toHaveBeenLastCalledWith(0, false);
    expect(auth.authenticated()).toBe(true);
  });
});
