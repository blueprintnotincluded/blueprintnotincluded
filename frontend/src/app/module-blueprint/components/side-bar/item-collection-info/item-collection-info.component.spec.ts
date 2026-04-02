import { waitForAsync, ComponentFixture, TestBed } from "@angular/core/testing";
import {
  provideHttpClient,
  withInterceptorsFromDi,
} from "@angular/common/http";
import { RouterTestingModule } from "@angular/router/testing";

import { BuildTool } from "src/app/module-blueprint/common/tools/build-tool";
import { ElementReport } from "src/app/module-blueprint/common/tools/element-report";
import { ItemCollectionInfoComponent } from "./item-collection-info.component";
import { AuthenticationService } from "src/app/module-blueprint/services/authentification-service";
import { SelectTool } from "src/app/module-blueprint/common/tools/select-tool";

xdescribe("ItemCollectionInfoComponent", () => {
  let component: ItemCollectionInfoComponent;
  let fixture: ComponentFixture<ItemCollectionInfoComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ItemCollectionInfoComponent],
      imports: [RouterTestingModule.withRoutes([])],
      providers: [
        AuthenticationService,
        BuildTool,
        ElementReport,
        SelectTool,
        provideHttpClient(withInterceptorsFromDi()),
      ],
    }).compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ItemCollectionInfoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });
});
