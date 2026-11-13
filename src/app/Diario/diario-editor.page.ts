import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonTitle,
  IonTextarea,
  IonToolbar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { arrowBackOutline, checkmarkOutline } from 'ionicons/icons';
import { DiarioStorageService } from './diario-storage.service';
import type { DiarioEntry } from './diario-entry.model';

@Component({
  selector: 'app-diario-editor',
  standalone: true,
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonInput,
    IonTextarea,
  ],
  templateUrl: './diario-editor.page.html',
  styleUrls: ['./diario-editor.page.scss'],
})
export class DiarioEditorPage implements OnInit, OnDestroy {
  entry?: DiarioEntry;
  title = '';
  content = '';
  loading = true;
  saving = false;
  error = '';
  private saveTimer?: ReturnType<typeof setTimeout>;
  private saveQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly storage: DiarioStorageService,
  ) {
    addIcons({ arrowBackOutline, checkmarkOutline });
  }

  async ngOnInit(): Promise<void> {
    try {
      const routeId = this.route.snapshot.paramMap.get('id');
      if (routeId === 'nova') {
        this.entry = await this.storage.createEntry();
        await this.router.navigate(['/diario', this.entry.id], { replaceUrl: true });
      } else if (routeId) {
        this.entry = (await this.storage.getEntry(routeId)) ?? undefined;
        if (!this.entry) {
          this.error = 'Esta anotação não foi encontrada.';
          return;
        }
      }
      if (this.entry) {
        this.title = this.entry.title;
        this.content = this.entry.content;
      }
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Não foi possível abrir a anotação.';
    } finally {
      this.loading = false;
    }
  }

  ngOnDestroy(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    void this.flushSave();
  }

  onTextChanged(): void {
    if (!this.entry) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saving = true;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = undefined;
      this.queueSave();
    }, 500);
  }

  async backToHistory(): Promise<void> {
    await this.flushSave();
    await this.router.navigateByUrl('/diario');
  }

  dateLabel(date?: string): string {
    if (!date) return '';
    return new Date(date).toLocaleString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private queueSave(): void {
    if (!this.entry) return;
    const snapshot: DiarioEntry = {
      ...this.entry,
      title: this.title,
      content: this.content,
    };
    this.saveQueue = this.saveQueue
      .then(async () => {
        const updated = await this.storage.updateEntry(snapshot);
        if (this.entry?.id === updated.id) this.entry = updated;
      })
      .catch((error: unknown) => {
        this.error = error instanceof Error ? error.message : 'Não foi possível salvar a anotação.';
      })
      .finally(() => {
        this.saving = false;
      });
  }

  private async flushSave(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = undefined;
      this.queueSave();
    }
    await this.saveQueue;
  }
}
