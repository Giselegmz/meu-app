
import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import {
  IonApp,
  IonSplitPane,
  IonMenu,
  IonContent,
  IonList,
   IonNote,
  IonListHeader,
  IonMenuToggle,
  IonItem,
  IonIcon,
  IonLabel,
  IonRouterOutlet
} from '@ionic/angular';

import { addIcons } from 'ionicons';

import {
  homeOutline,
  cameraOutline,
  flashOutline,
  phonePortraitOutline,
  locateOutline,
  speedometerOutline
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
export class AppComponent {

  protected readonly appPages = [
    { title: 'Início', url: '/folder/Inbox', icon: 'home' },
    { title: 'GPS', url: '/gps', icon: 'locate' },
    { title: 'Acelerômetro', url: '/experimento', icon: 'speedometer' },
    { title: 'Câmera', url: '/camera', icon: 'camera' },
    { title: 'Lanterna', url: '/flash', icon: 'flash' },
    { title: 'Bateria e Dispositivo', url: '/dispositivo', icon: 'phone-portrait' }
  ];

  constructor() {
    addIcons({
      homeOutline,
      cameraOutline,
      flashOutline,
      phonePortraitOutline,
      locateOutline,
      speedometerOutline
    });
  }
}
