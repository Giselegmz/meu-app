
import type { Routes } from '@angular/router';
import { accessPageGuard, authenticatedGuard } from './Diario/diario-auth.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'diario',
    pathMatch: 'full',
  },
  {
    path: 'acesso',
    canActivate: [accessPageGuard],
    loadComponent: () =>
      import('./Diario/diario-access.page').then((m) => m.DiarioAccessPage),
  },
  {
    path: 'folder/:folder',
    canActivate: [authenticatedGuard],
    loadComponent: () =>
      import('./folder/folder.page').then((m) => m.FolderPage),
  },
  {
    path: 'camera',
    canActivate: [authenticatedGuard],
    loadComponent: () =>
      import('./nativo/camera/camera.page').then((m) => m.CameraPage),
  },
  {
    path: 'flash',
    canActivate: [authenticatedGuard],
    loadComponent: () =>
      import('./nativo/flash/flash.page').then((m) => m.FlashPage),
  },
  {
    path: 'experimento',
    canActivate: [authenticatedGuard],
    loadComponent: () =>
      import('./nativo/experimento/experimento.page').then((m) => m.ExperimentoPage),
  },
  {
    path: 'dispositivo',
    canActivate: [authenticatedGuard],
    loadComponent: () =>
      import('./nativo/dispositivo/dispositivo.page').then((m) => m.DispositivoPage),
  },
  {
    path: 'gps',
    canActivate: [authenticatedGuard],
    loadComponent: () =>
      import('./nativo/gps/gps.page').then((m) => m.GpsPage),
  },
  {
    path: 'diario/nova',
    canActivate: [authenticatedGuard],
    loadComponent: () =>
      import('./Diario/diario-editor.page').then((m) => m.DiarioEditorPage),
  },
  {
    path: 'diario',
    canActivate: [authenticatedGuard],
    loadComponent: () =>
      import('./Diario/diario.page').then((m) => m.DiarioPage),
  },
  {
    path: 'diario/:id',
    canActivate: [authenticatedGuard],
    loadComponent: () =>
      import('./Diario/diario-editor.page').then((m) => m.DiarioEditorPage),
  },
  {
    path: '**',
    redirectTo: 'diario',
  },
];
