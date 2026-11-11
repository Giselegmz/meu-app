import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ExperimentoPage } from './experimento.page';

describe('ExperimentoPage', () => {
  let component: ExperimentoPage;
  let fixture: ComponentFixture<ExperimentoPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(ExperimentoPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
