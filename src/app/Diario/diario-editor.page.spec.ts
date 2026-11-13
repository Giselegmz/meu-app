import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { DiarioEditorPage } from './diario-editor.page';
import { DiarioStorageService } from './diario-storage.service';

describe('DiarioEditorPage', () => {
  it('creates an entry for /diario/nova when the route has no id parameter', async () => {
    const entry = {
      id: 'entry-1',
      title: '',
      content: '',
      createdAt: '2026-11-13T12:00:00.000Z',
      updatedAt: '2026-11-13T12:00:00.000Z',
    };
    const route = {
      snapshot: {
        paramMap: { get: () => null },
        routeConfig: { path: 'diario/nova' },
      },
    };
    const router = { navigate: vi.fn(() => new Promise<boolean>(() => undefined)) };
    const storage = { createEntry: vi.fn().mockResolvedValue(entry), listPhotos: vi.fn().mockResolvedValue([]) };
    const editor = new DiarioEditorPage(
      route as unknown as ActivatedRoute,
      router as unknown as Router,
      storage as unknown as DiarioStorageService,
    );

    await editor.ngOnInit();

    expect(storage.createEntry).toHaveBeenCalledOnce();
    expect(router.navigate).toHaveBeenCalledWith(['/diario', entry.id], { replaceUrl: true });
    expect(editor.entry()?.id).toBe(entry.id);
    expect(editor.title).toBe('');
    expect(editor.content).toBe('');
    expect(editor.loading()).toBe(false);
    expect(editor.error()).toBe('');
  });

  it('renders the fields when asynchronous SQLite creation finishes in zoneless Angular', async () => {
    const entry = {
      id: 'entry-2',
      title: 'Novo registro',
      content: 'Texto inicial',
      createdAt: '2026-11-13T12:00:00.000Z',
      updatedAt: '2026-11-13T12:00:00.000Z',
    };
    const storage = {
      createEntry: vi.fn().mockResolvedValue(entry),
      listPhotos: vi.fn().mockResolvedValue([]),
    };
    await TestBed.configureTestingModule({
      imports: [DiarioEditorPage],
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: { get: () => null },
              routeConfig: { path: 'diario/nova' },
            },
          },
        },
        { provide: Router, useValue: { navigate: vi.fn().mockResolvedValue(true) } },
        { provide: DiarioStorageService, useValue: storage },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(DiarioEditorPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Abrindo anotação');

    await fixture.whenStable();
    await vi.waitFor(() => expect(fixture.componentInstance.loading()).toBe(false));
    fixture.detectChanges();

    expect(storage.createEntry).toHaveBeenCalledOnce();
    expect(fixture.componentInstance.loading()).toBe(false);
    expect(fixture.componentInstance.entry()).toEqual(entry);
    expect(fixture.nativeElement.querySelector('ion-input')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('ion-textarea')).not.toBeNull();
    expect(fixture.componentInstance.title).toBe('Novo registro');
    expect(fixture.componentInstance.content).toBe('Texto inicial');
  });

  it('loads saved photos for the current entry without changing its text', async () => {
    const entry = {
      id: 'entry-with-photo',
      title: 'Texto preservado',
      content: 'Anotação preservada',
      createdAt: '2026-11-13T12:00:00.000Z',
      updatedAt: '2026-11-13T12:00:00.000Z',
    };
    const photo = {
      id: 'photo-1',
      entryId: entry.id,
      dataUrl: 'data:image/jpeg;base64,abc',
      createdAt: entry.createdAt,
      sortOrder: 0,
    };
    const storage = { getEntry: vi.fn().mockResolvedValue(entry), listPhotos: vi.fn().mockResolvedValue([photo]) };
    const editor = new DiarioEditorPage(
      {
        snapshot: { paramMap: { get: () => entry.id }, routeConfig: { path: 'diario/:id' } },
      } as unknown as ActivatedRoute,
      { navigate: vi.fn() } as unknown as Router,
      storage as unknown as DiarioStorageService,
    );

    await editor.ngOnInit();

    expect(editor.photos()).toEqual([photo]);
    expect(editor.title).toBe(entry.title);
    expect(editor.content).toBe(entry.content);
  });

  it('keeps typed text untouched when an image write fails', async () => {
    const entry = {
      id: 'entry-1',
      title: '',
      content: '',
      createdAt: '2026-11-13T12:00:00.000Z',
      updatedAt: '2026-11-13T12:00:00.000Z',
    };
    const storage = {
      createEntry: vi.fn().mockResolvedValue(entry),
      addPhoto: vi.fn().mockRejectedValue(new Error('Quota de armazenamento excedida')),
    };
    const editor = new DiarioEditorPage(
      {
        snapshot: { paramMap: { get: () => null }, routeConfig: { path: 'diario/nova' } },
      } as unknown as ActivatedRoute,
      { navigate: vi.fn().mockResolvedValue(true) } as unknown as Router,
      storage as unknown as DiarioStorageService,
    );
    await editor.ngOnInit();
    editor.title = 'Meu título';
    editor.content = 'Meu texto continua aqui';
    editor.pendingPhotos.set([{ id: 'photo-pending', dataUrl: 'data:image/jpeg;base64,abc' }]);

    await editor.savePendingPhotos();

    expect(editor.title).toBe('Meu título');
    expect(editor.content).toBe('Meu texto continua aqui');
    expect(editor.pendingPhotos()).toHaveLength(1);
    expect(editor.photoError()).toContain('Quota');
  });

  it('removes a saved image without submitting text changes', async () => {
    const entry = {
      id: 'entry-1',
      title: 'Título',
      content: 'Texto',
      createdAt: '2026-11-13T12:00:00.000Z',
      updatedAt: '2026-11-13T12:00:00.000Z',
    };
    const photo = {
      id: 'photo-1',
      entryId: entry.id,
      dataUrl: 'data:image/jpeg;base64,abc',
      createdAt: entry.createdAt,
      sortOrder: 0,
    };
    const storage = {
      getEntry: vi.fn().mockResolvedValue(entry),
      listPhotos: vi.fn().mockResolvedValue([photo]),
      deletePhoto: vi.fn().mockResolvedValue(undefined),
    };
    const editor = new DiarioEditorPage(
      {
        snapshot: { paramMap: { get: () => entry.id }, routeConfig: { path: 'diario/:id' } },
      } as unknown as ActivatedRoute,
      { navigate: vi.fn() } as unknown as Router,
      storage as unknown as DiarioStorageService,
    );
    await editor.ngOnInit();

    await editor.removePhoto(photo);

    expect(storage.deletePhoto).toHaveBeenCalledWith(entry.id, photo.id);
    expect(editor.photos()).toEqual([]);
    expect(editor.title).toBe(entry.title);
    expect(editor.content).toBe(entry.content);
  });
});
