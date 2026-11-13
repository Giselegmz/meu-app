import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  AlertController,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonMenuButton,
  IonSearchbar,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, bookOutline, lockClosedOutline, trashOutline } from 'ionicons/icons';
import { DiarioAuthService } from './diario-auth.service';
import { DiarioStorageService } from './diario-storage.service';
import type { DiarioEntry } from './diario-entry.model';

@Component({
  selector: 'app-diario',
  templateUrl: './diario.page.html',
  styleUrls: ['./diario.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonMenuButton,
    IonContent,
    IonButton,
    IonIcon,
    IonSearchbar,
  ],
})
export class DiarioPage implements OnInit {
  entries: DiarioEntry[] = [];
  searchTerm = '';
  loading = true;
  error = '';

  constructor(
    private readonly storage: DiarioStorageService,
    private readonly auth: DiarioAuthService,
    private readonly router: Router,
    private readonly alerts: AlertController,
  ) {
    addIcons({ addOutline, bookOutline, lockClosedOutline, trashOutline });
  }

  async ngOnInit(): Promise<void> {
    await this.loadEntries();
  }

  async updateSearch(event: CustomEvent<{ value?: string | null }>): Promise<void> {
    this.searchTerm = event.detail.value ?? '';
    await this.loadEntries();
  }

  async loadEntries(): Promise<void> {
    this.loading = true;
    this.error = '';
    try {
      this.entries = await this.storage.listEntries(this.searchTerm);
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Não foi possível carregar o histórico.';
    } finally {
      this.loading = false;
    }
  }

  async createEntry(): Promise<void> {
    await this.router.navigateByUrl('/diario/nova');
  }

  async editEntry(entry: DiarioEntry): Promise<void> {
    await this.router.navigate(['/diario', entry.id]);
  }

  async deleteEntry(entry: DiarioEntry, event: Event): Promise<void> {
    event.stopPropagation();
    const alert = await this.alerts.create({
      header: 'Excluir anotação?',
      message: 'Esta anotação será removida do dispositivo.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Excluir',
          role: 'destructive',
          handler: () => {
            void this.storage.deleteEntry(entry.id).then(() => this.loadEntries());
          },
        },
      ],
    });
    await alert.present();
  }

  async lock(): Promise<void> {
    this.auth.lock();
    await this.router.navigateByUrl('/acesso', { replaceUrl: true });
  }

  preview(content: string): string {
    const compact = content.replace(/\s+/g, ' ').trim();
    return compact.length > 115 ? `${compact.slice(0, 115)}…` : compact || 'Sem texto ainda';
  }

  dateLabel(date: string): string {
    return new Date(date).toLocaleString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
