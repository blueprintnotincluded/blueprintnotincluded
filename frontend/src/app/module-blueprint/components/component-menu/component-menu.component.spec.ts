import { waitForAsync, ComponentFixture, TestBed } from "@angular/core/testing";
import {
  provideHttpClient,
  withInterceptorsFromDi,
} from "@angular/common/http";
import { RouterTestingModule } from "@angular/router/testing";
import { MessageService } from "primeng/api";

import { AuthenticationService } from "src/app/module-blueprint/services/authentification-service";
import { BuildTool } from "src/app/module-blueprint/common/tools/build-tool";
import { ElementReport } from "src/app/module-blueprint/common/tools/element-report";
import { ComponentMenuComponent } from "./component-menu.component";
import { SelectTool } from "src/app/module-blueprint/common/tools/select-tool";

xdescribe("ComponentMenuComponent", () => {
  let component: ComponentMenuComponent;
  let fixture: ComponentFixture<ComponentMenuComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ComponentMenuComponent],
      imports: [RouterTestingModule.withRoutes([])],
      providers: [
        AuthenticationService,
        BuildTool,
        ElementReport,
        MessageService,
        SelectTool,
        provideHttpClient(withInterceptorsFromDi()),
      ],
    }).compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ComponentMenuComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });
});
