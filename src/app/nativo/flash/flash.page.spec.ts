import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FlashPage } from './flash.page';

describe('FlashPage', () => {
  let component: FlashPage;
  let fixture: ComponentFixture<FlashPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(FlashPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
