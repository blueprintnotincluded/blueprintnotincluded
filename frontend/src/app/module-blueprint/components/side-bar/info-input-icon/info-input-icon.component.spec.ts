import { ComponentFixture, TestBed } from "@angular/core/testing";

import { InfoInputIconComponent } from "./info-input-icon.component";

describe("InfoInputIconComponent", () => {
  let component: InfoInputIconComponent;
  let fixture: ComponentFixture<InfoInputIconComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [InfoInputIconComponent],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(InfoInputIconComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });
});
