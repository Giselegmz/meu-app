import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router, RouterLink } from '@angular/router';

import { AppComponent } from './app.component';
import { DiarioAuthService } from './Diario/diario-auth.service';

describe('AppComponent', () => {
  const authStub = {
    authenticated: signal(true),
    lock: vi.fn(),
  };

  beforeEach(async () => {
    authStub.authenticated.set(true);
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([]),
        { provide: DiarioAuthService, useValue: authStub },
      ],
    }).compileComponents();
  });

  it('creates the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('shows the existing feature menu after authentication', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelectorAll('ion-item').length).toBeGreaterThanOrEqual(7);
  });

  it('keeps the app menu hidden while locked', () => {
    authStub.authenticated.set(false);
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('ion-menu')).toBeNull();
  });

  it('retains the original routes behind the PIN gate', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    const links = fixture.debugElement
      .queryAll(By.directive(RouterLink))
      .map((element) => element.injector.get(RouterLink));
    const urls = links.map((link) => router.serializeUrl(link.urlTree!));
    expect(urls).toContain('/folder/Inbox');
    expect(urls).toContain('/gps');
    expect(urls).toContain('/experimento');
    expect(urls).toContain('/camera');
    expect(urls).toContain('/flash');
    expect(urls).toContain('/dispositivo');
    expect(urls).toContain('/diario');
  });
});
