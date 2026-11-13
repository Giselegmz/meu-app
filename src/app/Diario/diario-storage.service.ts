import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import type { DiarySecurityRecord, DiarioEntry, DiarioPhoto } from './diario-entry.model';

const DATABASE = 'one_diario';

export interface DiarioStorageDiagnostics {
  databaseExists: boolean | null;
  encryptionKeyAvailable: boolean | null;
  connectionOpen: boolean;
  sqliteInitialized: boolean;
}

@Injectable({ providedIn: 'root' })
export class DiarioStorageService {
  private readonly sqlite = new SQLiteConnection(CapacitorSQLite);
  private database?: SQLiteDBConnection;
  private databaseOpened = false;
  private initialization?: Promise<void>;
  private sessionUnlocked = false;
  private readonly native = Capacitor.isNativePlatform();
  private diagnostics: DiarioStorageDiagnostics = {
    databaseExists: null,
    encryptionKeyAvailable: null,
    connectionOpen: false,
    sqliteInitialized: false,
  };

  getInitializationDiagnostics(): DiarioStorageDiagnostics {
    return { ...this.diagnostics, connectionOpen: this.databaseOpened };
  }

  initialize(): Promise<void> {
    this.initialization ??= this.initializeDatabase().catch((error: unknown) => {
      this.initialization = undefined;
      throw error;
    });
    return this.initialization;
  }

  private async initializeDatabase(): Promise<void> {
    let databaseExists = false;
    if (!this.native) {
      await this.sqlite.initWebStore();
      databaseExists = await this.checkDatabaseExists();
    } else {
      let secret: unknown;
      try {
        secret = await this.sqlite.isSecretStored();
      } catch {
        this.diagnostics = { ...this.diagnostics, encryptionKeyAvailable: null };
        throw new Error('Não foi possível verificar a chave de criptografia do Android. O diário permanece bloqueado.');
      }
      if (
        typeof secret !== 'object' ||
        secret === null ||
        Array.isArray(secret) ||
        !Object.prototype.hasOwnProperty.call(secret, 'result') ||
        typeof (secret as { result?: unknown }).result !== 'boolean'
      ) {
        this.diagnostics = { ...this.diagnostics, encryptionKeyAvailable: null };
        throw new Error(
          'Não foi possível confirmar a disponibilidade da chave de criptografia. O diário permanece bloqueado.',
        );
      }
      const secretAvailable = (secret as { result: boolean }).result;
      this.diagnostics = { ...this.diagnostics, encryptionKeyAvailable: secretAvailable };
      if (!secretAvailable) {
        databaseExists = await this.checkDatabaseExists();
        if (databaseExists) {
          throw new Error(
            'A chave segura do diário não está disponível. Os dados foram mantidos e nenhum conteúdo foi aberto.',
          );
        }
        await this.sqlite.setEncryptionSecret(this.createRandomSecret());
        this.diagnostics = { ...this.diagnostics, encryptionKeyAvailable: true };
      } else {
        databaseExists = await this.checkDatabaseExists();
      }
    }

    if (!this.database) {
      const connected = await this.sqlite.isConnection(DATABASE, false);
      this.database = connected.result
        ? await this.sqlite.retrieveConnection(DATABASE, false)
        : await this.sqlite.createConnection(
            DATABASE,
            this.native,
            this.native ? (databaseExists ? 'encryption' : 'secret') : 'no-encryption',
            1,
            false,
          );
    }
    if (!this.databaseOpened) {
      await this.database.open();
      this.databaseOpened = true;
      this.diagnostics = { ...this.diagnostics, connectionOpen: true };
    }

    // SQLCipher protects native database files. Android stores its database
    // secret through the plugin's Android Keystore-backed encrypted prefs.
    await this.database.execute(`
      CREATE TABLE IF NOT EXISTS diary_security (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        salt TEXT NOT NULL,
        pin_hash TEXT NOT NULL,
        iterations INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS diary_auth_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        failed_attempts INTEGER NOT NULL DEFAULT 0,
        alarm_active INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS diary_entries (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS diary_entries_updated_at_idx
        ON diary_entries(updated_at DESC);
      CREATE TABLE IF NOT EXISTS diary_entry_photos (
        id TEXT PRIMARY KEY NOT NULL,
        entry_id TEXT NOT NULL,
        data_url TEXT NOT NULL,
        created_at TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS diary_entry_photos_entry_idx
        ON diary_entry_photos(entry_id, sort_order, created_at);
    `);

    if (!databaseExists && !this.native) {
      await this.sqlite.saveToStore(DATABASE);
    }
    this.diagnostics = { ...this.diagnostics, sqliteInitialized: true };
  }

  private async checkDatabaseExists(): Promise<boolean> {
    const status = await this.sqlite.isDatabase(DATABASE);
    if (!status || (status.result !== true && status.result !== false)) {
      this.diagnostics = { ...this.diagnostics, databaseExists: null };
      throw new Error('Não foi possível confirmar se o banco do diário existe. Nenhum banco substituto foi criado.');
    }
    this.diagnostics = { ...this.diagnostics, databaseExists: status.result };
    return status.result;
  }

  async getSecurityRecord(): Promise<DiarySecurityRecord | null> {
    const rows = await this.requireDatabase().query(
      'SELECT salt, pin_hash, iterations FROM diary_security WHERE id = 1',
    );
    const row = rows.values?.[0];
    if (!row) return null;
    const state = await this.getSecurityState();
    return {
      salt: String(row.salt),
      hash: String(row.pin_hash),
      iterations: Number(row.iterations),
      failedAttempts: state.failedAttempts,
      alarmActive: state.alarmActive,
    };
  }

  async saveSecurityRecord(record: DiarySecurityRecord): Promise<void> {
    await this.requireDatabase().run(
      `INSERT INTO diary_security
        (id, salt, pin_hash, iterations)
       VALUES (1, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         salt = excluded.salt,
         pin_hash = excluded.pin_hash,
         iterations = excluded.iterations`,
      [record.salt, record.hash, record.iterations],
    );
    await this.requireDatabase().run(
      `INSERT INTO diary_auth_state (id, failed_attempts, alarm_active)
       VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         failed_attempts = excluded.failed_attempts,
         alarm_active = excluded.alarm_active`,
      [record.failedAttempts, record.alarmActive ? 1 : 0],
    );
    await this.persistWebDatabase();
  }

  async getSecurityState(): Promise<{ failedAttempts: number; alarmActive: boolean }> {
    const rows = await this.requireDatabase().query(
      'SELECT failed_attempts, alarm_active FROM diary_auth_state WHERE id = 1',
    );
    const row = rows.values?.[0];
    return row
      ? {
          failedAttempts: Number(row.failed_attempts),
          alarmActive: Number(row.alarm_active) === 1,
        }
      : { failedAttempts: 0, alarmActive: false };
  }

  async saveSecurityState(failedAttempts: number, alarmActive: boolean): Promise<void> {
    await this.requireDatabase().run(
      `INSERT INTO diary_auth_state (id, failed_attempts, alarm_active)
       VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         failed_attempts = excluded.failed_attempts,
         alarm_active = excluded.alarm_active`,
      [failedAttempts, alarmActive ? 1 : 0],
    );
    await this.persistWebDatabase();
  }

  setSessionUnlocked(unlocked: boolean): void {
    this.sessionUnlocked = unlocked;
  }

  async listEntries(search = ''): Promise<DiarioEntry[]> {
    this.assertUnlocked();
    const normalized = search.trim();
    const rows = await this.requireDatabase().query(
      `SELECT id, title, content, created_at, updated_at
       FROM diary_entries
       WHERE ? = '' OR title LIKE ? COLLATE NOCASE OR content LIKE ? COLLATE NOCASE
       ORDER BY updated_at DESC`,
      [normalized, `%${normalized}%`, `%${normalized}%`],
    );
    return (rows.values ?? []).map((row) => ({
      id: String(row.id),
      title: String(row.title),
      content: String(row.content),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    }));
  }

  async getEntry(id: string): Promise<DiarioEntry | null> {
    this.assertUnlocked();
    const result = await this.requireDatabase().query(
      'SELECT id, title, content, created_at, updated_at FROM diary_entries WHERE id = ?',
      [id],
    );
    const row = result.values?.[0];
    return row
      ? {
          id: String(row.id),
          title: String(row.title),
          content: String(row.content),
          createdAt: String(row.created_at),
          updatedAt: String(row.updated_at),
        }
      : null;
  }

  async createEntry(): Promise<DiarioEntry> {
    this.assertUnlocked();
    const now = new Date().toISOString();
    const entry: DiarioEntry = {
      id: crypto.randomUUID(),
      title: '',
      content: '',
      createdAt: now,
      updatedAt: now,
    };
    await this.requireDatabase().run(
      'INSERT INTO diary_entries (id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [entry.id, entry.title, entry.content, now, now],
    );
    await this.persistWebDatabase();
    return entry;
  }

  async updateEntry(entry: DiarioEntry): Promise<DiarioEntry> {
    this.assertUnlocked();
    const updated: DiarioEntry = {
      ...entry,
      updatedAt: new Date().toISOString(),
    };
    await this.requireDatabase().run('UPDATE diary_entries SET title = ?, content = ?, updated_at = ? WHERE id = ?', [
      updated.title,
      updated.content,
      updated.updatedAt,
      updated.id,
    ]);
    await this.persistWebDatabase();
    return updated;
  }

  async deleteEntry(id: string): Promise<void> {
    this.assertUnlocked();
    const database = this.requireDatabase();
    await database.beginTransaction();
    try {
      await database.run('DELETE FROM diary_entry_photos WHERE entry_id = ?', [id]);
      await database.run('DELETE FROM diary_entries WHERE id = ?', [id]);
      await database.commitTransaction();
    } catch (error) {
      await database.rollbackTransaction();
      throw error;
    }
    await this.persistWebDatabase();
  }

  async listPhotos(entryId: string): Promise<DiarioPhoto[]> {
    this.assertUnlocked();
    const rows = await this.requireDatabase().query(
      `SELECT id, entry_id, data_url, created_at, sort_order
       FROM diary_entry_photos WHERE entry_id = ? ORDER BY sort_order, created_at`,
      [entryId],
    );
    return (rows.values ?? []).map((row) => ({
      id: String(row.id),
      entryId: String(row.entry_id),
      dataUrl: String(row.data_url),
      createdAt: String(row.created_at),
      sortOrder: Number(row.sort_order),
    }));
  }

  async addPhoto(entryId: string, dataUrl: string, photoId: string = crypto.randomUUID()): Promise<DiarioPhoto> {
    this.assertUnlocked();
    const database = this.requireDatabase();
    const timestamp = new Date().toISOString();
    const photo: DiarioPhoto = {
      id: photoId,
      entryId,
      dataUrl,
      createdAt: timestamp,
      sortOrder: 0,
    };
    const order = await database.query(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM diary_entry_photos WHERE entry_id = ?',
      [entryId],
    );
    photo.sortOrder = Number(order.values?.[0]?.next_order ?? 0);
    const inserted = await database.run(
      `INSERT INTO diary_entry_photos (id, entry_id, data_url, created_at, sort_order)
       SELECT ?, id, ?, ?, ? FROM diary_entries WHERE id = ?
       ON CONFLICT(id) DO UPDATE SET
         data_url = excluded.data_url,
         sort_order = excluded.sort_order
       WHERE diary_entry_photos.entry_id = excluded.entry_id`,
      [photo.id, photo.dataUrl, photo.createdAt, photo.sortOrder, entryId],
    );
    if ((inserted.changes?.changes ?? 0) === 0) {
      throw new Error('A anotação não existe mais. A foto não foi salva.');
    }
    await this.persistWebDatabase();
    return photo;
  }

  async deletePhoto(entryId: string, photoId: string): Promise<void> {
    this.assertUnlocked();
    await this.requireDatabase().run('DELETE FROM diary_entry_photos WHERE id = ? AND entry_id = ?', [
      photoId,
      entryId,
    ]);
    await this.persistWebDatabase();
  }

  private async persistWebDatabase(): Promise<void> {
    if (!this.native) {
      await this.sqlite.saveToStore(DATABASE);
    }
  }

  private requireDatabase(): SQLiteDBConnection {
    if (!this.database) {
      throw new Error('O armazenamento seguro do diário ainda não foi inicializado.');
    }
    return this.database;
  }

  private assertUnlocked(): void {
    if (!this.sessionUnlocked) {
      throw new Error('Autentique-se antes de acessar as anotações.');
    }
  }

  private createRandomSecret(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  }
}
