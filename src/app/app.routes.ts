
import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'folder/Inbox',
    pathMatch: 'full',
  },
  {
    path: 'folder/:folder',
    loadComponent: () =>
      import('./folder/folder.page').then((m) => m.FolderPage),
  },
  {
    path: 'camera',
    loadComponent: () =>
      import('./nativo/camera/camera.page').then((m) => m.CameraPage),
  },
  {
    path: 'flash',
    loadComponent: () =>
      import('./nativo/flash/flash.page').then((m) => m.FlashPage),
  },
  {
    path: 'experimento',
    loadComponent: () =>
      import('./nativo/experimento/experimento.page').then((m) => m.ExperimentoPage),
  },
  {
    path: 'dispositivo',
    loadComponent: () =>
      import('./nativo/dispositivo/dispositivo.page').then((m) => m.DispositivoPage),
  },
  {
    path: 'gps',
    loadComponent: () =>
      import('./nativo/gps/gps.page').then((m) => m.GpsPage),
  },
];
