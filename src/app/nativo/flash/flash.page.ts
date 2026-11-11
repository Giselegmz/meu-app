
import { Component } from '@angular/core';
import { Flashlight } from '@awesome-cordova-plugins/flashlight/ngx';

import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonMenuButton,
  IonContent,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonButton
} from '@ionic/angular';

@Component({
  selector: 'app-flash',
  templateUrl: './flash.page.html',
  styleUrls: ['./flash.page.scss'],
  standalone: true,
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonMenuButton,
    IonContent,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonButton
  ],
  providers: [Flashlight]
})
export class FlashPage {

  isLigada = false;

  constructor(private flashlight: Flashlight) {}

  async alternarLanterna() {
    try {
      await this.flashlight.toggle();
      this.isLigada = !this.isLigada;
    } catch (erro) {
      console.error('Erro ao acionar a lanterna:', erro);
      alert('Não foi possível acessar a lanterna. Teste em um celular Android compatível.');
    }
  }
}
