import { vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const database = {
    execute: vi.fn(),
    open: vi.fn(),
    query: vi.fn(),
    run: vi.fn(),
  };
  const sqlite = {
    initWebStore: vi.fn(),
    isDatabase: vi.fn(),
    createConnection: vi.fn(),
    saveToStore: vi.fn(),
    isSecretStored: vi.fn(),
    setEncryptionSecret: vi.fn(),
  };
  return { database, sqlite };
});

vi.mock('@capacitor-community/sqlite', () => ({
  CapacitorSQLite: mocks.sqlite,
  SQLiteConnection: class {
    constructor() {
      return mocks.sqlite;
    }
  },
}));

import { DiarioStorageService } from './diario-storage.service';

describe('DiarioStorageService', () => {
  let storage: DiarioStorageService;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sqlite.isDatabase.mockResolvedValue({ result: true });
    mocks.sqlite.createConnection.mockResolvedValue(mocks.database);
    mocks.database.query.mockResolvedValue({ values: [] });
    mocks.database.run.mockResolvedValue({ changes: { changes: 1 } });
    storage = new DiarioStorageService();
  });

  it('refuses to return journal entries while the session is locked', async () => {
    await storage.initialize();
    await expect(storage.listEntries()).rejects.toThrow('Autentique-se');
    expect(mocks.database.query).not.toHaveBeenCalled();
  });

  it('searches authenticated history and maps stored dates', async () => {
    await storage.initialize();
    storage.setSessionUnlocked(true);
    mocks.database.query.mockResolvedValueOnce({
      values: [
        {
          id: 'entry-1',
          title: 'Um dia tranquilo',
          content: 'Hoje foi bom.',
          created_at: '2026-11-13T12:00:00.000Z',
          updated_at: '2026-11-13T12:10:00.000Z',
        },
      ],
    });

    const entries = await storage.listEntries('tranquilo');

    expect(entries).toEqual([
      {
        id: 'entry-1',
        title: 'Um dia tranquilo',
        content: 'Hoje foi bom.',
        createdAt: '2026-11-13T12:00:00.000Z',
        updatedAt: '2026-11-13T12:10:00.000Z',
      },
    ]);
    expect(mocks.database.query).toHaveBeenCalledWith(
      expect.stringContaining('title LIKE ?'),
      ['tranquilo', '%tranquilo%', '%tranquilo%'],
    );
  });

  it('persists a new entry and an edit with a fresh timestamp', async () => {
    await storage.initialize();
    storage.setSessionUnlocked(true);
    const entry = await storage.createEntry();
    expect(entry.id).toBeTruthy();
    expect(entry.createdAt).toBe(entry.updatedAt);

    const updated = await storage.updateEntry({
      ...entry,
      title: 'Memórias',
      content: 'Uma anotação.',
    });
    expect(updated.title).toBe('Memórias');
    expect(updated.updatedAt).toBeTruthy();
    expect(mocks.database.run).toHaveBeenCalledTimes(2);
  });
});
