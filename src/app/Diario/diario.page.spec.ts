import { ChangeDetectorRef } from '@angular/core';
import { AlertController } from '@ionic/angular';
import { DiarioPage } from './diario.page';
import { DiarioAuthService } from './diario-auth.service';
import { DiarioStorageService } from './diario-storage.service';
import type { DiarioEntry } from './diario-entry.model';

describe('DiarioPage deletion', () => {
  const entry: DiarioEntry = {
    id: 'entry-1',
    title: 'Registro',
    content: 'Conteúdo',
    createdAt: '2026-11-13T12:00:00.000Z',
    updatedAt: '2026-11-13T12:00:00.000Z',
  };

  function createPage(role: string, deletion: Promise<void> = Promise.resolve()) {
    const storage = {
      deleteEntry: vi.fn(() => deletion),
      listEntries: vi.fn(),
    };
    const alert = {
      present: vi.fn().mockResolvedValue(undefined),
      onDidDismiss: vi.fn().mockResolvedValue({ role }),
    };
    const alerts = { create: vi.fn().mockResolvedValue(alert) };
    const changeDetector = { markForCheck: vi.fn() };
    const page = new DiarioPage(
      storage as unknown as DiarioStorageService,
      {} as DiarioAuthService,
      {} as never,
      alerts as unknown as AlertController,
      changeDetector as unknown as ChangeDetectorRef,
    );
    page.entries = [entry];
    return { page, storage, alert, alerts, changeDetector };
  }

  it('removes the entry from the visible history only after SQLite deletion completes', async () => {
    let finishDelete!: () => void;
    const deletePromise = new Promise<void>((resolve) => {
      finishDelete = resolve;
    });
    const { page, storage, alert } = createPage('destructive', deletePromise);
    const event = { stopPropagation: vi.fn() } as unknown as Event;

    const operation = page.deleteEntry(entry, event);
    await vi.waitFor(() => expect(storage.deleteEntry).toHaveBeenCalledWith(entry.id));
    expect(alert.present).toHaveBeenCalledOnce();
    expect(page.entries).toEqual([entry]);

    finishDelete();
    await operation;

    expect(page.entries).toEqual([]);
    expect(storage.listEntries).not.toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
  });

  it('keeps the entry visible and reports an error when SQLite deletion fails', async () => {
    const { page, storage, changeDetector } = createPage(
      'destructive',
      Promise.reject(new Error('Falha SQLite simulada')),
    );

    await page.deleteEntry(entry, { stopPropagation: vi.fn() } as unknown as Event);

    expect(storage.deleteEntry).toHaveBeenCalledWith(entry.id);
    expect(page.entries).toEqual([entry]);
    expect(page.error).toBe('Falha SQLite simulada');
    expect(changeDetector.markForCheck).toHaveBeenCalledOnce();
  });

  it('does not delete when the confirmation is cancelled', async () => {
    const { page, storage } = createPage('cancel');

    await page.deleteEntry(entry, { stopPropagation: vi.fn() } as unknown as Event);

    expect(storage.deleteEntry).not.toHaveBeenCalled();
    expect(page.entries).toEqual([entry]);
  });
});
