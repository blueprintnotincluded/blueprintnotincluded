import { DatePipe } from "@angular/common";
import { NO_ERRORS_SCHEMA } from "@angular/core";
import { waitForAsync, ComponentFixture, TestBed } from "@angular/core/testing";
import { RouterTestingModule } from "@angular/router/testing";
import { DialogModule } from "primeng/dialog";

import { DialogBrowseComponent } from "./dialog-browse.component";
import { AuthenticationService } from "src/app/module-blueprint/services/authentification-service";
import { BlueprintService } from "src/app/module-blueprint/services/blueprint-service";

describe("DialogBrowseComponent", () => {
  let component: DialogBrowseComponent;
  let fixture: ComponentFixture<DialogBrowseComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [DialogBrowseComponent],
      // DialogModule is real so the #browseDialog ViewChild (whose onShow
      // ngOnInit subscribes to) resolves; everything else is shallow.
      imports: [RouterTestingModule.withRoutes([]), DialogModule],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        DatePipe,
        {
          provide: AuthenticationService,
          useValue: { isLoggedIn: () => false },
        },
        { provide: BlueprintService, useValue: {} },
      ],
    }).compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(DialogBrowseComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });
});
