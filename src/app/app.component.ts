
import { Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { App } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';

import {
  IonApp,
  IonSplitPane,
  IonMenu,
  IonContent,
  IonList,
  IonListHeader,
  IonMenuToggle,
  IonItem,
  IonIcon,
  IonLabel,
  IonRouterOutlet
} from '@ionic/angular';

import { addIcons } from 'ionicons';
import { DiarioAuthService } from './Diario/diario-auth.service';

import {
  homeOutline,
  cameraOutline,
  flashOutline,
  phonePortraitOutline,
  locateOutline,
  speedometerOutline,
  bookOutline
} from 'ionicons/icons';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  imports: [
    RouterLink,
    RouterLinkActive,
    IonApp,
    IonSplitPane,
    IonMenu,
    IonContent,
    IonList,
    IonListHeader,
    IonMenuToggle,
    IonItem,
    IonIcon,
    IonLabel,
    IonRouterOutlet
  ],
})
export class AppComponent implements OnInit, OnDestroy {

  private appStateListener?: PluginListenerHandle;
  private readonly onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') this.lockForBackground();
  };

  constructor(
    protected readonly auth: DiarioAuthService,
    private readonly router: Router,
    private readonly zone: NgZone,
  ) {
    addIcons({
      homeOutline,
      cameraOutline,
      flashOutline,
      phonePortraitOutline,
      locateOutline,
      speedometerOutline,
      bookOutline
    });
  }

  ngOnInit(): void {
    void App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) this.lockForBackground();
    }).then((listener) => {
      this.appStateListener = listener;
    }).catch(() => undefined);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  ngOnDestroy(): void {
    void this.appStateListener?.remove();
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }

  private lockForBackground(): void {
    if (!this.auth.authenticated()) return;
    this.zone.run(() => {
      this.auth.lock();
      void this.router.navigateByUrl('/acesso', { replaceUrl: true });
    });
  }

  protected readonly appPages = [
    { title: 'Meu Diário', url: '/diario', icon: 'book' },
    { title: 'Início', url: '/folder/Inbox', icon: 'home' },
    { title: 'GPS', url: '/gps', icon: 'locate' },
    { title: 'Acelerômetro', url: '/experimento', icon: 'speedometer' },
    { title: 'Câmera', url: '/camera', icon: 'camera' },
    { title: 'Lanterna', url: '/flash', icon: 'flash' },
    { title: 'Bateria e Dispositivo', url: '/dispositivo', icon: 'phone-portrait' }
  ];
}
