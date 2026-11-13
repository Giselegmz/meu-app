import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import {
  CapacitorSQLite,
  SQLiteConnection,
  SQLiteDBConnection,
} from '@capacitor-community/sqlite';
import type { DiarySecurityRecord, DiarioEntry } from './diario-entry.model';

const DATABASE = 'one_diario';

@Injectable({ providedIn: 'root' })
export class DiarioStorageService {
  private readonly sqlite = new SQLiteConnection(CapacitorSQLite);
  private database?: SQLiteDBConnection;
  private initialization?: Promise<void>;
  private sessionUnlocked = false;
  private readonly native = Capacitor.isNativePlatform();

  initialize(): Promise<void> {
    this.initialization ??= this.initializeDatabase().catch((error: unknown) => {
      this.initialization = undefined;
      throw error;
    });
    return this.initialization;
  }

  private async initializeDatabase(): Promise<void> {
    if (!this.native) {
      await this.sqlite.initWebStore();
    } else {
      const secret = await this.sqlite.isSecretStored();
      if (!secret.result) {
        const existing = await this.sqlite.isDatabase(DATABASE);
        if (existing.result) {
          throw new Error(
            'A chave segura do diário não está disponível. Os dados foram mantidos e nenhum conteúdo foi aberto.',
          );
        }
        await this.sqlite.setEncryptionSecret(this.createRandomSecret());
      }
    }

    const exists = await this.sqlite.isDatabase(DATABASE);
    this.database = await this.sqlite.createConnection(
      DATABASE,
      this.native,
      this.native ? 'encryption' : 'no-encryption',
      1,
      false,
    );
    await this.database.open();

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
    `);

    if (!exists.result && !this.native) {
      await this.sqlite.saveToStore(DATABASE);
    }
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
    await this.saveSecurityState(record.failedAttempts, record.alarmActive);
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

  async saveSecurityState(
    failedAttempts: number,
    alarmActive: boolean,
  ): Promise<void> {
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
    await this.requireDatabase().run(
      'UPDATE diary_entries SET title = ?, content = ?, updated_at = ? WHERE id = ?',
      [updated.title, updated.content, updated.updatedAt, updated.id],
    );
    await this.persistWebDatabase();
    return updated;
  }

  async deleteEntry(id: string): Promise<void> {
    this.assertUnlocked();
    await this.requireDatabase().run('DELETE FROM diary_entries WHERE id = ?', [id]);
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
