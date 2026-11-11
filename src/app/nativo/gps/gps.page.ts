
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

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
  selector: 'app-gps',
  templateUrl: './gps.page.html',
  styleUrls: ['./gps.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
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
  ]
})
export class GpsPage {

  latitude: number | null = null;
  longitude: number | null = null;
  precisao: number | null = null;
  mensagem = '';

  obterLocalizacao() {

    this.mensagem = 'Solicitando acesso à localização...';

    if (!navigator.geolocation) {
      this.mensagem = 'Seu navegador não oferece suporte à localização.';
      return;
    }

    navigator.geolocation.getCurrentPosition(

      (position) => {

        this.latitude = position.coords.latitude;
        this.longitude = position.coords.longitude;
        this.precisao = position.coords.accuracy;

        this.mensagem = 'Localização obtida com sucesso!';

      },

      (erro) => {

        console.error('Erro ao obter localização:', erro);

        if (erro.code === 1) {
          this.mensagem = 'Permissão de localização negada. Autorize o acesso no navegador.';
        } else if (erro.code === 2) {
          this.mensagem = 'Localização indisponível. Verifique o GPS do celular.';
        } else if (erro.code === 3) {
          this.mensagem = 'Tempo esgotado. Tente novamente.';
        } else {
          this.mensagem = 'Não foi possível obter a localização.';
        }

      },

      {
        enableHighAccuracy: false,
        timeout: 20000,
        maximumAge: 0
      }

    );
  }
}
