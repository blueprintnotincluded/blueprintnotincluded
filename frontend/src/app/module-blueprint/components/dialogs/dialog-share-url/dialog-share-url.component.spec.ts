import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NO_ERRORS_SCHEMA } from "@angular/core";
import {
  provideHttpClient,
  withInterceptorsFromDi,
} from "@angular/common/http";
import { RouterTestingModule } from "@angular/router/testing";
import { MessageService } from "primeng/api";

import { DialogShareUrlComponent } from "./dialog-share-url.component";
import { AuthenticationService } from "src/app/module-blueprint/services/authentification-service";

describe("DialogShareUrlComponent", () => {
  let component: DialogShareUrlComponent;
  let fixture: ComponentFixture<DialogShareUrlComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [DialogShareUrlComponent],
      schemas: [NO_ERRORS_SCHEMA],
      imports: [RouterTestingModule.withRoutes([])],
      providers: [
        AuthenticationService,
        MessageService,
        provideHttpClient(withInterceptorsFromDi()),
      ],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(DialogShareUrlComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  describe("url", () => {
    it("is empty when neither blueprintId input nor blueprintService.id is set", () => {
      expect(component.url).toBe("");
    });

    it("falls back to blueprintService.id when the input is not set", () => {
      component.blueprintService.id = "editor-id";
      expect(component.url).toContain("/b/editor-id");
    });

    it("prefers the blueprintId input over blueprintService.id", () => {
      component.blueprintService.id = "editor-id";
      component.blueprintId = "details-id";
      expect(component.url).toContain("/b/details-id");
      expect(component.url).not.toContain("editor-id");
    });
  });

  describe("redditShareUrl", () => {
    it("includes the url and a generic title when blueprintName is unset", () => {
      component.blueprintId = "bp1";
      const url = new URL(component.redditShareUrl);
      expect(url.origin + url.pathname).toBe("https://www.reddit.com/submit");
      expect(url.searchParams.get("url")).toContain("/b/bp1");
      expect(url.searchParams.get("title")).toBeTruthy();
    });

    it("uses blueprintName as the title when set", () => {
      component.blueprintId = "bp1";
      component.blueprintName = "My Coal Generator";
      const url = new URL(component.redditShareUrl);
      expect(url.searchParams.get("title")).toBe("My Coal Generator");
    });
  });
});
