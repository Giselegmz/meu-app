
import { Component, OnInit } from '@angular/core';
import { Device } from '@capacitor/device';
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
  IonItem,
  IonLabel,
  IonButton
} from '@ionic/angular';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-dispositivo',
  templateUrl: './dispositivo.page.html',
  styleUrls: ['./dispositivo.page.scss'],
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
    IonItem,
    IonLabel,
    IonButton
  ]
})
export class DispositivoPage implements OnInit {

  batteryLevel: number | null = null;
  isCharging = false;

  model = '';
  platform = '';
  osVersion = '';
  manufacturer = '';
  isVirtual = false;

  constructor() {}

  ngOnInit() {
    this.carregarInformacoes();
  }

  async carregarInformacoes() {
    try {
      const battery = await Device.getBatteryInfo();

      this.batteryLevel = battery.batteryLevel != null
        ? Math.round(battery.batteryLevel * 100)
        : null;

      this.isCharging = battery.isCharging ?? false;

      const info = await Device.getInfo();

      this.model = info.model;
      this.platform = info.platform;
      this.osVersion = info.osVersion;
      this.manufacturer = info.manufacturer;
      this.isVirtual = info.isVirtual;

    } catch (e) {
      console.error('Erro ao carregar dados do dispositivo:', e);
    }
  }
}
