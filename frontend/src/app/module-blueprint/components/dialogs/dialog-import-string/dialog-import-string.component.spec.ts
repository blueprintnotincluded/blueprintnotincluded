import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NO_ERRORS_SCHEMA } from "@angular/core";
import {
  provideHttpClient,
  withInterceptorsFromDi,
} from "@angular/common/http";
import { RouterTestingModule } from "@angular/router/testing";
import { MessageService } from "primeng/api";

import { DialogImportStringComponent } from "./dialog-import-string.component";
import { BlueprintService } from "src/app/module-blueprint/services/blueprint-service";
import { AuthenticationService } from "src/app/module-blueprint/services/authentification-service";

describe("DialogImportStringComponent", () => {
  let component: DialogImportStringComponent;
  let fixture: ComponentFixture<DialogImportStringComponent>;
  let blueprintService: BlueprintService;
  let messageService: MessageService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [DialogImportStringComponent],
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
    fixture = TestBed.createComponent(DialogImportStringComponent);
    component = fixture.componentInstance;
    blueprintService = TestBed.inject(BlueprintService);
    messageService = TestBed.inject(MessageService);
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("showDialog clears previous text and opens", () => {
    component.blueprintText = "stale";
    component.showDialog();
    expect(component.visible).toBe(true);
    expect(component.blueprintText).toBe("");
  });

  it("canImport is false for blank text", () => {
    component.blueprintText = "   ";
    expect(component.canImport).toBe(false);
    component.blueprintText = "{}";
    expect(component.canImport).toBe(true);
  });

  it("import() hands the trimmed text to the service and closes on success", async () => {
    const open = vi
      .spyOn(blueprintService, "openBlueprintFromShareString")
      .mockResolvedValue();
    component.showDialog();
    component.blueprintText = '  {"friendlyname":"x","buildings":[]}  ';

    component.import();
    await vi.waitFor(() => expect(component.visible).toBe(false));

    expect(open).toHaveBeenCalledWith('{"friendlyname":"x","buildings":[]}');
  });

  it("import() surfaces a toast and stays open on failure", async () => {
    vi.spyOn(
      blueprintService,
      "openBlueprintFromShareString",
    ).mockRejectedValue(new Error("bad input"));
    const toast = vi.spyOn(messageService, "add");
    component.showDialog();
    component.blueprintText = "garbage";

    component.import();
    await vi.waitFor(() => expect(toast).toHaveBeenCalled());

    expect(component.visible).toBe(true);
    expect(toast.mock.calls[0][0].severity).toBe("error");
  });
});
