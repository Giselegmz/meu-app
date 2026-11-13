import { vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const database = {
    execute: vi.fn(),
    open: vi.fn(),
    beginTransaction: vi.fn(),
    commitTransaction: vi.fn(),
    rollbackTransaction: vi.fn(),
    query: vi.fn(),
    run: vi.fn(),
  };
  const sqlite = {
    initWebStore: vi.fn(),
    isDatabase: vi.fn(),
    isConnection: vi.fn(),
    retrieveConnection: vi.fn(),
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
    mocks.sqlite.isConnection.mockResolvedValue({ result: false });
    mocks.sqlite.retrieveConnection.mockResolvedValue(mocks.database);
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
    expect(mocks.database.query).toHaveBeenCalledWith(expect.stringContaining('title LIKE ?'), [
      'tranquilo',
      '%tranquilo%',
      '%tranquilo%',
    ]);
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

  it('reuses the created connection when schema setup fails and initialization is retried', async () => {
    mocks.database.execute.mockRejectedValueOnce(new Error('Interrupção simulada'));

    await expect(storage.initialize()).rejects.toThrow('Interrupção simulada');
    await storage.initialize();

    expect(mocks.sqlite.createConnection).toHaveBeenCalledOnce();
    expect(mocks.database.open).toHaveBeenCalledOnce();
    expect(mocks.database.execute).toHaveBeenCalledTimes(2);
  });

  it('retrieves a registered SQLite connection instead of creating a duplicate', async () => {
    mocks.sqlite.isConnection.mockResolvedValueOnce({ result: true });

    await storage.initialize();

    expect(mocks.sqlite.retrieveConnection).toHaveBeenCalledWith('one_diario', false);
    expect(mocks.sqlite.createConnection).not.toHaveBeenCalled();
    expect(mocks.database.open).toHaveBeenCalledOnce();
  });

  it('writes the secure PIN record and auth state with only one web database snapshot', async () => {
    await storage.initialize();
    await storage.saveSecurityRecord({
      salt: 'salt',
      hash: 'hash',
      iterations: 600_000,
      failedAttempts: 0,
      alarmActive: false,
    });

    expect(mocks.database.run).toHaveBeenCalledTimes(2);
    expect(mocks.sqlite.saveToStore).toHaveBeenCalledOnce();
  });

  it('waits for web persistence after deleting an entry', async () => {
    await storage.initialize();
    storage.setSessionUnlocked(true);
    let finishSnapshot!: () => void;
    mocks.sqlite.saveToStore.mockImplementationOnce(() => new Promise<void>((resolve) => (finishSnapshot = resolve)));

    let deletionFinished = false;
    const deletion = storage.deleteEntry('entry-1').then(() => {
      deletionFinished = true;
    });
    await vi.waitFor(() => expect(mocks.sqlite.saveToStore).toHaveBeenCalledOnce());
    expect(deletionFinished).toBe(false);
    finishSnapshot();
    await deletion;

    expect(mocks.database.run).toHaveBeenCalledWith('DELETE FROM diary_entry_photos WHERE entry_id = ?', ['entry-1']);
    expect(mocks.database.run).toHaveBeenCalledWith('DELETE FROM diary_entries WHERE id = ?', ['entry-1']);
    expect(deletionFinished).toBe(true);
  });

  it('stores and reloads photos under their owning entry id', async () => {
    await storage.initialize();
    storage.setSessionUnlocked(true);
    const photo = await storage.addPhoto('entry-1', 'data:image/jpeg;base64,abc', 'photo-1');
    expect(photo.entryId).toBe('entry-1');
    expect(photo.dataUrl).toBe('data:image/jpeg;base64,abc');
    expect(mocks.database.run).toHaveBeenCalledWith(
      expect.stringContaining('SELECT ?, id, ?, ?, ? FROM diary_entries WHERE id = ?'),
      [photo.id, photo.dataUrl, photo.createdAt, 0, 'entry-1'],
    );

    mocks.database.query.mockResolvedValueOnce({
      values: [
        { id: photo.id, entry_id: 'entry-1', data_url: photo.dataUrl, created_at: photo.createdAt, sort_order: 0 },
      ],
    });
    await expect(storage.listPhotos('entry-1')).resolves.toEqual([photo]);
    expect(mocks.database.query).toHaveBeenLastCalledWith(expect.stringContaining('WHERE entry_id = ?'), ['entry-1']);
  });

  it('removes only the selected photo belonging to the specified entry', async () => {
    await storage.initialize();
    storage.setSessionUnlocked(true);
    await storage.deletePhoto('entry-1', 'photo-1');
    expect(mocks.database.run).toHaveBeenCalledWith('DELETE FROM diary_entry_photos WHERE id = ? AND entry_id = ?', [
      'photo-1',
      'entry-1',
    ]);
    expect(mocks.database.run).not.toHaveBeenCalledWith(expect.stringContaining('diary_entries'), expect.anything());
  });

  it('rolls back a parent deletion if removing its linked photos fails', async () => {
    await storage.initialize();
    storage.setSessionUnlocked(true);
    mocks.database.run.mockRejectedValueOnce(new Error('Falha de escrita'));
    await expect(storage.deleteEntry('entry-1')).rejects.toThrow('Falha de escrita');
    expect(mocks.database.rollbackTransaction).toHaveBeenCalledOnce();
    expect(mocks.database.commitTransaction).not.toHaveBeenCalled();
  });
});
