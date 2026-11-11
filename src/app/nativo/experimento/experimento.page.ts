
import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Motion } from '@capacitor/motion';
import { PluginListenerHandle } from '@capacitor/core';

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
  selector: 'app-experimento',
  templateUrl: './experimento.page.html',
  styleUrls: ['./experimento.page.scss'],
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
export class ExperimentoPage implements OnDestroy {

  x = 0;
  y = 0;
  z = 0;
  ativo = false;
  mensagem = '';

  private listener?: PluginListenerHandle;

  async iniciarAcelerometro() {
    try {
      if (typeof DeviceMotionEvent !== 'undefined') {
        const evento = DeviceMotionEvent as unknown as {
          requestPermission?: () => Promise<string>
        };

        if (evento.requestPermission) {
          const permissao = await evento.requestPermission();

          if (permissao !== 'granted') {
            this.mensagem = 'Permissão do sensor negada.';
            return;
          }
        }
      }

      this.listener = await Motion.addListener('accel', (event) => {
        this.x = event.acceleration?.x ?? 0;
        this.y = event.acceleration?.y ?? 0;
        this.z = event.acceleration?.z ?? 0;
      });

      this.ativo = true;
      this.mensagem = 'Acelerômetro iniciado!';
    } catch (erro) {
      console.error(erro);
      this.mensagem = 'Não foi possível acessar o acelerômetro.';
    }
  }

  async pararAcelerometro() {
    await this.listener?.remove();
    this.listener = undefined;
    this.ativo = false;
    this.mensagem = 'Acelerômetro parado.';
  }

  async ngOnDestroy() {
    await this.listener?.remove();
  }
}
