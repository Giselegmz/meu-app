import { Injectable, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { Haptics } from '@capacitor/haptics';
import { DiarioStorageService, type DiarioStorageDiagnostics } from './diario-storage.service';
import type { DiarySecurityRecord } from './diario-entry.model';

export interface DiarioAuthDiagnostics extends DiarioStorageDiagnostics {
  secureCredentialPresent: boolean | null;
  legacySaltPresent: boolean | null;
  legacyHashPresent: boolean | null;
}

const LEGACY_ITERATIONS = 150_000;
const CURRENT_ITERATIONS = 600_000;
const PIN_LENGTH = 4;

@Injectable({ providedIn: 'root' })
export class DiarioAuthService {
  readonly ready = signal(false);
  readonly authenticated = signal(false);
  readonly requiresSetup = signal(false);
  readonly failedAttempts = signal(0);
  readonly alarmActive = signal(false);
  readonly initializationError = signal('');
  readonly diagnostics = signal<DiarioAuthDiagnostics>({
    databaseExists: null,
    encryptionKeyAvailable: null,
    connectionOpen: false,
    sqliteInitialized: false,
    secureCredentialPresent: null,
    legacySaltPresent: null,
    legacyHashPresent: null,
  });

  private initialization?: Promise<void>;
  private audioContext?: AudioContext;
  private alarmTimer?: ReturnType<typeof setInterval>;

  constructor(private readonly storage: DiarioStorageService) {}

  initialize(): Promise<void> {
    this.initialization ??= this.loadSecureState();
    return this.initialization;
  }

  async retryInitialization(): Promise<void> {
    this.initialization = undefined;
    this.ready.set(false);
    this.initializationError.set('');
    await this.initialize();
  }

  private async loadSecureState(): Promise<void> {
    try {
      await this.storage.initialize();
      this.updateStorageDiagnostics();
      const credential = await this.storage.getSecurityRecord();
      this.diagnostics.update((state) => ({ ...state, secureCredentialPresent: credential !== null }));
      const legacySalt = await Preferences.get({ key: 'diario_pin_salt' });
      const hasLegacySalt = legacySalt.value !== null;
      this.diagnostics.update((state) => ({ ...state, legacySaltPresent: hasLegacySalt }));
      const legacyHash = await Preferences.get({ key: 'diario_pin_hash' });
      const hasLegacyHash = legacyHash.value !== null;
      this.diagnostics.update((state) => ({ ...state, legacyHashPresent: hasLegacyHash }));
      const secureState = credential ?? (await this.storage.getSecurityState());

      if (credential && !this.isValidCredential(credential)) {
        throw new Error(
          'O registro seguro do PIN está incompleto ou inválido. O diário permanece bloqueado e os dados foram preservados.',
        );
      }

      this.failedAttempts.set(secureState.failedAttempts);
      this.alarmActive.set(secureState.alarmActive);
      this.requiresSetup.set(!credential && !hasLegacySalt && !hasLegacyHash);

      if (
        !credential &&
        (hasLegacySalt !== hasLegacyHash || (hasLegacySalt && (!legacySalt.value || !legacyHash.value)))
      ) {
        this.initializationError.set(
          'A credencial antiga está incompleta. O diário continua bloqueado e os dados foram preservados.',
        );
      }
      if (credential && (legacySalt.value || legacyHash.value)) {
        // A secure copy is authoritative. The legacy copy is removed only
        // after the database credential has successfully unlocked the app.
        this.requiresSetup.set(false);
      }
      if (this.alarmActive()) this.startAlarmLoop();
    } catch (error) {
      this.updateStorageDiagnostics();
      try {
        const [legacySalt, legacyHash] = await Promise.all([
          Preferences.get({ key: 'diario_pin_salt' }),
          Preferences.get({ key: 'diario_pin_hash' }),
        ]);
        this.diagnostics.update((state) => ({
          ...state,
          legacySaltPresent: legacySalt.value !== null,
          legacyHashPresent: legacyHash.value !== null,
        }));
      } catch {
        // Diagnostics remain unknown if even the preferences API is unavailable.
      }
      this.initializationError.set(
        error instanceof Error
          ? error.message
          : 'Não foi possível abrir o armazenamento seguro. Nenhum registro foi carregado.',
      );
      this.requiresSetup.set(false);
    } finally {
      this.ready.set(true);
    }
  }

  private updateStorageDiagnostics(): void {
    const storage = this.storage.getInitializationDiagnostics();
    this.diagnostics.update((state) => ({ ...state, ...storage }));
  }

  private isValidCredential(record: DiarySecurityRecord): boolean {
    if (
      !record.salt ||
      !record.hash ||
      !Number.isSafeInteger(record.iterations) ||
      record.iterations < 1 ||
      record.iterations > 1_000_000
    ) {
      return false;
    }
    try {
      return atob(record.salt).length >= 8 && atob(record.hash).length === 32;
    } catch {
      return false;
    }
  }

  async createPin(pin: string): Promise<string | null> {
    await this.initialize();
    if (this.initializationError()) return this.initializationError();
    if (!/^\d{4}$/.test(pin)) return 'O PIN deve ter exatamente quatro números.';
    if (!this.requiresSetup()) return 'O PIN já está configurado.';

    try {
      this.requireWebCrypto();
      const salt = this.randomBase64(16);
      const record: DiarySecurityRecord = {
        salt,
        hash: await this.hashPin(pin, salt, CURRENT_ITERATIONS),
        iterations: CURRENT_ITERATIONS,
        failedAttempts: 0,
        alarmActive: false,
      };
      await this.storage.saveSecurityRecord(record);
      const saved = await this.storage.getSecurityRecord();
      if (!saved || !(await this.matchesPin(pin, saved))) {
        throw new Error('Não foi possível validar o PIN salvo. O diário permanece bloqueado.');
      }
      this.requiresSetup.set(false);
      await this.markAuthenticated();
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'Não foi possível criar o PIN.';
    }
  }

  async unlock(pin: string): Promise<string | null> {
    await this.initialize();
    if (this.initializationError()) return this.initializationError();
    if (!/^\d{4}$/.test(pin)) return 'Digite os quatro números do PIN.';

    try {
      let record = await this.storage.getSecurityRecord();
      if (record) {
        if (!(await this.matchesPin(pin, record))) return this.recordFailure();
        await this.removeLegacyCredentialAfterVerification();
        await this.clearAlarmAndFailures();
        await this.markAuthenticated();
        return null;
      }

      const [legacySalt, legacyHash] = await Promise.all([
        Preferences.get({ key: 'diario_pin_salt' }),
        Preferences.get({ key: 'diario_pin_hash' }),
      ]);
      if (!legacySalt.value || !legacyHash.value) {
        return 'Não foi possível localizar o PIN antigo. O diário continua bloqueado.';
      }

      const legacyMatches = await this.matchesPin(pin, {
        salt: legacySalt.value,
        hash: legacyHash.value,
        iterations: LEGACY_ITERATIONS,
        failedAttempts: this.failedAttempts(),
        alarmActive: this.alarmActive(),
      });
      if (!legacyMatches) return this.recordFailure();

      // Migration is transactional from the user's perspective: leave the
      // old PIN untouched until the encrypted record has been written and
      // independently read back. A failure never grants diary access.
      const migrated: DiarySecurityRecord = {
        salt: this.randomBase64(16),
        hash: '',
        iterations: CURRENT_ITERATIONS,
        failedAttempts: this.failedAttempts(),
        alarmActive: this.alarmActive(),
      };
      migrated.hash = await this.hashPin(pin, migrated.salt, migrated.iterations);
      await this.storage.saveSecurityRecord(migrated);
      record = await this.storage.getSecurityRecord();
      if (!record || !(await this.matchesPin(pin, record))) {
        throw new Error('A migração do PIN não foi validada; a credencial antiga foi mantida.');
      }

      await this.removeLegacyCredentialAfterVerification();
      await this.clearAlarmAndFailures();
      await this.markAuthenticated();
      return null;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('A criptografia do navegador')) {
        return error.message;
      }
      return error instanceof Error
        ? `${error.message} Tente novamente; o PIN antigo não será removido antes da validação.`
        : 'Falha segura na migração. O diário permanece bloqueado; tente novamente.';
    }
  }

  lock(): void {
    this.authenticated.set(false);
    this.storage.setSessionUnlocked(false);
    this.stopAlarmLoop();
  }

  resumeAlarmIfActive(): void {
    if (this.alarmActive() && !this.authenticated()) this.startAlarmLoop();
  }

  async stopAlarmAfterOwnerUnlock(): Promise<void> {
    await this.clearAlarmAndFailures();
  }

  private async markAuthenticated(): Promise<void> {
    this.storage.setSessionUnlocked(true);
    this.authenticated.set(true);
    this.stopAlarmLoop();
  }

  private async recordFailure(): Promise<string> {
    const next = Math.min(3, this.failedAttempts() + 1);
    const active = next >= 3 || this.alarmActive();
    await this.storage.saveSecurityState(next, active);
    this.failedAttempts.set(next);
    this.alarmActive.set(active);
    if (active) {
      this.startAlarmLoop();
      return 'Três tentativas incorretas. Alarme ativado; o diário continua bloqueado.';
    }
    return next === 2 ? 'PIN incorreto. Resta uma tentativa.' : 'PIN incorreto. Tente novamente.';
  }

  private async clearAlarmAndFailures(): Promise<void> {
    await this.storage.saveSecurityState(0, false);
    this.failedAttempts.set(0);
    this.alarmActive.set(false);
    this.stopAlarmLoop();
  }

  private async removeLegacyCredentialAfterVerification(): Promise<void> {
    await Preferences.remove({ key: 'diario_pin_salt' });
    await Preferences.remove({ key: 'diario_pin_hash' });
  }

  private async matchesPin(pin: string, record: DiarySecurityRecord): Promise<boolean> {
    const derived = await this.hashPin(pin, record.salt, record.iterations);
    return this.constantTimeEqual(derived, record.hash);
  }

  private async hashPin(pin: string, saltBase64: string, iterations: number): Promise<string> {
    const salt = Uint8Array.from(atob(saltBase64), (char) => char.charCodeAt(0));
    const subtle = this.requireWebCrypto().subtle;
    const material = await subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
    const result = await subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, material, 256);
    return btoa(String.fromCharCode(...new Uint8Array(result)));
  }

  private constantTimeEqual(left: string, right: string): boolean {
    if (left.length !== right.length) return false;
    let difference = 0;
    for (let index = 0; index < left.length; index++) {
      difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
    }
    return difference === 0;
  }

  private randomBase64(size: number): string {
    const cryptoApi = this.requireWebCrypto();
    return btoa(String.fromCharCode(...cryptoApi.getRandomValues(new Uint8Array(size))));
  }

  private requireWebCrypto(): Crypto {
    const cryptoApi = globalThis.crypto;
    if (!cryptoApi?.subtle || !cryptoApi.getRandomValues) {
      throw new Error(
        'A criptografia do navegador não está disponível. Abra o diário em uma conexão segura HTTPS e tente novamente.',
      );
    }
    return cryptoApi;
  }

  private startAlarmLoop(): void {
    if (this.alarmTimer) return;
    this.playAlarmPulse();
    this.alarmTimer = setInterval(() => this.playAlarmPulse(), 1500);
  }

  private playAlarmPulse(): void {
    try {
      this.audioContext ??= new AudioContext();
      if (this.audioContext.state === 'suspended') void this.audioContext.resume();
      const oscillator = this.audioContext.createOscillator();
      const volume = this.audioContext.createGain();
      oscillator.type = 'sawtooth';
      oscillator.frequency.value = 880;
      volume.gain.setValueAtTime(0.32, this.audioContext.currentTime);
      oscillator.connect(volume);
      volume.connect(this.audioContext.destination);
      oscillator.start();
      oscillator.stop(this.audioContext.currentTime + 0.65);
      void Haptics.vibrate({ duration: 450 }).catch(() => undefined);
      oscillator.onended = () => {
        oscillator.disconnect();
        volume.disconnect();
      };
    } catch {
      // The persistent alarm flag remains active even if the platform
      // temporarily blocks audio or vibration.
    }
  }

  private stopAlarmLoop(): void {
    if (this.alarmTimer) clearInterval(this.alarmTimer);
    this.alarmTimer = undefined;
    const context = this.audioContext;
    this.audioContext = undefined;
    if (context && context.state !== 'closed') void context.close().catch(() => undefined);
  }
}
