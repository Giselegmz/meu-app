import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { Camera, MediaTypeSelection, type MediaResult } from '@capacitor/camera';
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
import { arrowBackOutline, cameraOutline, checkmarkOutline, closeOutline, imagesOutline } from 'ionicons/icons';
import { DiarioStorageService } from './diario-storage.service';
import type { DiarioEntry, DiarioPhoto } from './diario-entry.model';

interface PendingDiaryPhoto {
  id: string;
  dataUrl: string;
}

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
  readonly entry = signal<DiarioEntry | undefined>(undefined);
  title = '';
  content = '';
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly photos = signal<DiarioPhoto[]>([]);
  readonly pendingPhotos = signal<PendingDiaryPhoto[]>([]);
  readonly photoBusy = signal(false);
  readonly photoError = signal('');
  private saveTimer?: ReturnType<typeof setTimeout>;
  private saveQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly storage: DiarioStorageService,
  ) {
    addIcons({ arrowBackOutline, cameraOutline, checkmarkOutline, closeOutline, imagesOutline });
  }

  async ngOnInit(): Promise<void> {
    try {
      const routeId = this.route.snapshot.paramMap.get('id');
      if (routeId === 'nova' || this.route.snapshot.routeConfig?.path === 'diario/nova') {
        const newEntry = await this.storage.createEntry();
        this.entry.set(newEntry);
        this.title = newEntry.title;
        this.content = newEntry.content;
        void this.router.navigate(['/diario', newEntry.id], { replaceUrl: true }).catch((error: unknown) => {
          this.error.set(error instanceof Error ? error.message : 'Não foi possível abrir a anotação.');
        });
      } else if (routeId) {
        const entry = (await this.storage.getEntry(routeId)) ?? undefined;
        this.entry.set(entry);
        if (!entry) {
          this.error.set('Esta anotação não foi encontrada.');
          return;
        }
      } else {
        this.error.set('Não foi possível identificar esta anotação.');
      }
      const entry = this.entry();
      if (entry) {
        this.title = entry.title;
        this.content = entry.content;
        this.photos.set(await this.storage.listPhotos(entry.id));
      }
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Não foi possível abrir a anotação.');
    } finally {
      this.loading.set(false);
    }
  }

  ngOnDestroy(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    void this.flushSave();
  }

  onTextChanged(): void {
    if (!this.entry()) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saving.set(true);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = undefined;
      this.queueSave();
    }, 500);
  }

  async backToHistory(): Promise<void> {
    await this.flushSave();
    await this.router.navigateByUrl('/diario');
  }

  async takePhoto(): Promise<void> {
    await this.collectPhotos(async () => [
      await Camera.takePhoto({ quality: 85, targetWidth: 1600, targetHeight: 1600 }),
    ]);
  }

  async choosePhotos(): Promise<void> {
    await this.collectPhotos(async () => {
      const result = await Camera.chooseFromGallery({
        mediaType: MediaTypeSelection.Photo,
        allowMultipleSelection: true,
        limit: 20,
        quality: 85,
        targetWidth: 1600,
        targetHeight: 1600,
      });
      return result.results;
    });
  }

  removePendingPhoto(index: number): void {
    this.pendingPhotos.update((photos) => photos.filter((_, photoIndex) => photoIndex !== index));
  }

  async savePendingPhotos(): Promise<void> {
    const entry = this.entry();
    if (!entry || this.photoBusy()) return;
    this.photoBusy.set(true);
    this.photoError.set('');
    try {
      // Commit text before photo writes. A photo failure cannot roll back the entry text.
      await this.flushSave();
      while (this.pendingPhotos().length) {
        const [pending, ...remaining] = this.pendingPhotos();
        const photo = await this.storage.addPhoto(entry.id, pending.dataUrl, pending.id);
        this.photos.update((photos) => [...photos, photo]);
        this.pendingPhotos.set(remaining);
      }
    } catch (error) {
      this.photoError.set(
        error instanceof Error
          ? error.message
          : 'Não foi possível salvar uma ou mais fotos. O texto da anotação foi preservado.',
      );
    } finally {
      this.photoBusy.set(false);
    }
  }

  async removePhoto(photo: DiarioPhoto): Promise<void> {
    const entry = this.entry();
    if (!entry) return;
    this.photoError.set('');
    try {
      await this.storage.deletePhoto(entry.id, photo.id);
      this.photos.update((photos) => photos.filter((item) => item.id !== photo.id));
    } catch (error) {
      this.photoError.set(error instanceof Error ? error.message : 'Não foi possível remover esta foto.');
    }
  }

  private async collectPhotos(load: () => Promise<MediaResult[]>): Promise<void> {
    if (this.photoBusy()) return;
    this.photoBusy.set(true);
    this.photoError.set('');
    try {
      const results = await load();
      const compressed: PendingDiaryPhoto[] = [];
      for (const result of results) {
        compressed.push({
          id: crypto.randomUUID(),
          dataUrl: await this.compressPhoto(await this.readPhoto(result)),
        });
      }
      this.pendingPhotos.update((photos) => [...photos, ...compressed]);
    } catch (error) {
      this.photoError.set(error instanceof Error ? error.message : 'Não foi possível carregar as fotos selecionadas.');
    } finally {
      this.photoBusy.set(false);
    }
  }

  private async readPhoto(photo: MediaResult): Promise<string> {
    if (photo.thumbnail) {
      return photo.thumbnail.startsWith('data:') ? photo.thumbnail : `data:image/jpeg;base64,${photo.thumbnail}`;
    }
    const source = photo.webPath ?? (photo.uri ? Capacitor.convertFileSrc(photo.uri) : undefined);
    if (!source) throw new Error('O dispositivo não forneceu os dados da foto. Tente selecionar outra imagem.');
    const response = await fetch(source);
    if (!response.ok) throw new Error('Não foi possível ler a foto selecionada.');
    return URL.createObjectURL(await response.blob());
  }

  private async compressPhoto(source: string): Promise<string> {
    const image = new Image();
    image.src = source;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('A foto selecionada não pôde ser processada.'));
    });
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Não foi possível preparar a foto para armazenamento.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    if (source.startsWith('blob:')) URL.revokeObjectURL(source);
    return canvas.toDataURL('image/jpeg', 0.82);
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
    const entry = this.entry();
    if (!entry) return;
    const snapshot: DiarioEntry = {
      ...entry,
      title: this.title,
      content: this.content,
    };
    this.saveQueue = this.saveQueue
      .then(async () => {
        const updated = await this.storage.updateEntry(snapshot);
        if (this.entry()?.id === updated.id) this.entry.set(updated);
      })
      .catch((error: unknown) => {
        this.error.set(error instanceof Error ? error.message : 'Não foi possível salvar a anotação.');
      })
      .finally(() => {
        this.saving.set(false);
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
