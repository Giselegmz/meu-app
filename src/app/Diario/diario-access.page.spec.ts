import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { DiarioAccessPage } from './diario-access.page';
import { DiarioAuthService } from './diario-auth.service';

describe('DiarioAccessPage temporary diagnostics', () => {
  let auth: ReturnType<typeof makeAuth>;
  let fixture: ComponentFixture<DiarioAccessPage>;

  function makeAuth() {
    return {
      diagnostics: signal({
        databaseExists: true as boolean | null,
        encryptionKeyAvailable: true as boolean | null,
        connectionOpen: true,
        sqliteInitialized: true,
        secureCredentialPresent: false as boolean | null,
        legacySaltPresent: true as boolean | null,
        legacyHashPresent: false as boolean | null,
      }),
      requiresSetup: signal(false),
      initializationError: signal(''),
      authenticated: signal(false),
      alarmActive: signal(false),
      failedAttempts: signal(0),
      initialize: vi.fn().mockResolvedValue(undefined),
      resumeAlarmIfActive: vi.fn(),
      retryInitialization: vi.fn().mockResolvedValue(undefined),
      createPin: vi.fn(),
      unlock: vi.fn(),
    };
  }

  beforeEach(async () => {
    auth = makeAuth();
    await TestBed.configureTestingModule({
      imports: [DiarioAccessPage],
      providers: [
        provideZonelessChangeDetection(),
        { provide: Router, useValue: { navigateByUrl: vi.fn() } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: vi.fn() } } } },
        { provide: DiarioAuthService, useValue: auth },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(DiarioAccessPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => fixture.destroy());

  it('shows only state indicators when requested and keeps the PIN flow unchanged', async () => {
    const textBefore = fixture.nativeElement.textContent as string;
    expect(textBefore).not.toContain('Registro em diary_security');

    const buttons = fixture.nativeElement.querySelectorAll('ion-button') as NodeListOf<HTMLElement>;
    const toggle = Array.from(buttons).find((button: HTMLElement) =>
      button.textContent.includes('Ver diagnóstico temporário'),
    ) as HTMLElement;
    toggle.click();
    fixture.detectChanges();

    const visibleText = fixture.nativeElement.textContent as string;
    expect(visibleText).toContain('Registro em diary_security: não');
    expect(visibleText).toContain('Preferências legadas de PIN existem: sim');
    expect(visibleText).toContain('Preferências legadas completas: não');
    expect(visibleText).toContain('requiresSetup: false');
    expect(visibleText).toContain('Erro de inicialização presente: não');
    expect(visibleText).toContain('Chave de criptografia disponível: sim');
    expect(visibleText).toContain('Banco de dados existe: sim');
    expect(visibleText).toContain('Digite seu PIN para continuar.');
    expect(visibleText).not.toMatch(/PIN:\s*\d|hash=[^\s]|salt=[^\s]|chave=[^\s]/i);
    expect(auth.authenticated()).toBe(false);
    expect(auth.createPin).not.toHaveBeenCalled();
    expect(auth.unlock).not.toHaveBeenCalled();
  });

  it('can display unverified values without treating them as absent', async () => {
    auth.diagnostics.set({
      databaseExists: null,
      encryptionKeyAvailable: null,
      connectionOpen: false,
      sqliteInitialized: false,
      secureCredentialPresent: null,
      legacySaltPresent: null,
      legacyHashPresent: null,
    });
    fixture.detectChanges();
    const buttons = fixture.nativeElement.querySelectorAll('ion-button') as NodeListOf<HTMLElement>;
    const toggle = Array.from(buttons).find((button: HTMLElement) =>
      button.textContent.includes('Ver diagnóstico temporário'),
    ) as HTMLElement;
    toggle.click();
    fixture.detectChanges();

    const visibleText = fixture.nativeElement.textContent as string;
    expect(visibleText).toContain('não verificado');
    expect(visibleText).toContain('Preferências legadas completas: não verificado');
    expect(visibleText).toContain('Registro em diary_security: não verificado');

    fixture.destroy();
  });
});
