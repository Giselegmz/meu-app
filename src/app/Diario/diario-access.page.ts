import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { IonButton, IonContent } from '@ionic/angular';
import { DiarioAuthService } from './diario-auth.service';

@Component({
  selector: 'app-diario-access',
  standalone: true,
  imports: [CommonModule, IonButton, IonContent],
  templateUrl: './diario-access.page.html',
  styleUrl: './diario-access.page.scss',
})
export class DiarioAccessPage implements OnInit {
  readonly digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'Limpar'];
  code = '';
  firstPin = '';
  confirming = false;
  message = '';
  busy = false;
  diagnosticsVisible = false;

  constructor(
    protected readonly auth: DiarioAuthService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
  ) {}

  async ngOnInit(): Promise<void> {
    await this.auth.initialize();
    this.auth.resumeAlarmIfActive();
    this.message = this.auth.initializationError();
  }

  async retryInitialization(): Promise<void> {
    this.message = '';
    await this.auth.retryInitialization();
    this.message = this.auth.initializationError();
    this.auth.resumeAlarmIfActive();
  }

  ionViewWillEnter(): void {
    this.auth.resumeAlarmIfActive();
  }

  press(value: string): void {
    if (this.busy) return;
    this.message = '';
    if (value === 'Limpar') {
      this.code = '';
    } else if (value === '⌫') {
      this.code = this.code.slice(0, -1);
    } else if (this.code.length < 4) {
      this.code += value;
    }
  }

  async submit(): Promise<void> {
    if (this.code.length !== 4 || this.busy) return;
    this.busy = true;
    this.message = '';
    try {
      if (this.auth.requiresSetup()) {
        if (!this.confirming) {
          this.firstPin = this.code;
          this.code = '';
          this.confirming = true;
          return;
        }
        if (this.code !== this.firstPin) {
          this.code = '';
          this.message = 'Os números não coincidem. Confirme o PIN novamente.';
          return;
        }
        this.message = (await this.auth.createPin(this.code)) ?? '';
      } else {
        this.message = (await this.auth.unlock(this.code)) ?? '';
      }
      this.code = '';
      if (this.auth.authenticated()) {
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
        const destination = returnUrl?.startsWith('/') ? returnUrl : '/diario';
        await this.router.navigateByUrl(destination, { replaceUrl: true });
      }
    } catch (error) {
      this.message = error instanceof Error ? error.message : 'Não foi possível continuar.';
    } finally {
      this.busy = false;
    }
  }

  get heading(): string {
    if (this.auth.initializationError()) return 'Diário indisponível';
    if (this.auth.requiresSetup()) {
      return this.confirming ? 'Confirme seu PIN' : 'Crie seu PIN';
    }
    return 'Seu diário, protegido';
  }

  get instruction(): string {
    if (this.auth.initializationError()) {
      return 'Não foi possível confirmar o estado do diário. Nenhum PIN foi aceito. Tente novamente.';
    }
    if (this.auth.requiresSetup()) {
      return this.confirming
        ? 'Digite novamente os quatro números escolhidos.'
        : 'Escolha quatro números para proteger suas anotações.';
    }
    return 'Digite seu PIN para continuar.';
  }

  diagnosticState(value: boolean | null): string {
    return value === null ? 'não verificado' : value ? 'sim' : 'não';
  }

  get legacyPreferencesExist(): boolean | null {
    const { legacySaltPresent, legacyHashPresent } = this.auth.diagnostics();
    if (legacySaltPresent === null || legacyHashPresent === null) return null;
    return legacySaltPresent || legacyHashPresent;
  }

  get legacyPreferencesComplete(): boolean | null {
    const { legacySaltPresent, legacyHashPresent } = this.auth.diagnostics();
    if (legacySaltPresent === null || legacyHashPresent === null) return null;
    return legacySaltPresent && legacyHashPresent;
  }
}
