
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

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

  async obterLocalizacao() {
    this.mensagem = 'Solicitando acesso à localização...';

    try {
      if (Capacitor.isNativePlatform()) {

        const permissao = await Geolocation.requestPermissions();

        if (
          permissao.location !== 'granted' &&
          permissao.coarseLocation !== 'granted'
        ) {
          this.mensagem = 'Permissão de localização negada.';
          return;
        }

        const position = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 0
        });

        this.latitude = position.coords.latitude;
        this.longitude = position.coords.longitude;
        this.precisao = position.coords.accuracy;

      } else {

        if (!navigator.geolocation) {
          this.mensagem = 'Seu navegador não oferece suporte à localização.';
          return;
        }

        const position = await new Promise<GeolocationPosition>(
          (resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
              resolve,
              reject,
              {
                enableHighAccuracy: true,
                timeout: 20000,
                maximumAge: 0
              }
            );
          }
        );

        this.latitude = position.coords.latitude;
        this.longitude = position.coords.longitude;
        this.precisao = position.coords.accuracy;
      }

      this.mensagem = 'Localização obtida com sucesso!';

    } catch (erro: any) {
      console.error('Erro ao obter localização:', erro);

      this.mensagem =
        erro?.message || 'Não foi possível obter a localização. Verifique as permissões e o GPS do celular.';
    }
  }
}
