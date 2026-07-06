import { DatePipe } from "@angular/common";
import { NO_ERRORS_SCHEMA } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { of, throwError } from "rxjs";
import { MessageService } from "primeng/api";

import { VersionHistoryDialogComponent } from "./version-history-dialog.component";
import { BlueprintVersionService } from "src/app/module-blueprint/services/blueprint-version.service";

function makeVersion(overrides: any = {}) {
  return {
    id: "v1",
    name: "stable",
    createdAt: "2026-01-01T00:00:00.000Z",
    thumbnail: null,
    ...overrides,
  };
}

describe("VersionHistoryDialogComponent", () => {
  let component: VersionHistoryDialogComponent;
  let fixture: ComponentFixture<VersionHistoryDialogComponent>;
  let versionService: any;
  let messageService: any;

  beforeEach(async () => {
    versionService = {
      getVersions: vi.fn().mockReturnValue(of({ versions: [makeVersion()] })),
      createVersion: vi
        .fn()
        .mockReturnValue(of({ version: makeVersion({ id: "v2" }) })),
      restoreVersion: vi.fn().mockReturnValue(of({ version: makeVersion() })),
      deleteVersion: vi.fn().mockReturnValue(of({ deleteVersion: "OK" })),
    };
    messageService = { add: vi.fn() };

    await TestBed.configureTestingModule({
      declarations: [VersionHistoryDialogComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        DatePipe,
        { provide: BlueprintVersionService, useValue: versionService },
        { provide: MessageService, useValue: messageService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(VersionHistoryDialogComponent);
    component = fixture.componentInstance;
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("loads versions when shown", () => {
    component.showDialog("bp-1", true);

    expect(versionService.getVersions).toHaveBeenCalledWith("bp-1");
    expect(component.versions.length).toBe(1);
    expect(component.loading).toBe(false);
    expect(component.visible).toBe(true);
  });

  it("creates a named snapshot, trims the name, and reloads the list", () => {
    component.blueprintId = "bp-1";
    component.newVersionName = "  my snapshot  ";

    component.createVersion();

    expect(versionService.createVersion).toHaveBeenCalledWith(
      "bp-1",
      "my snapshot"
    );
    expect(component.newVersionName).toBe("");
    expect(versionService.getVersions).toHaveBeenCalledWith("bp-1");
  });

  it("sends null for a blank snapshot name", () => {
    component.blueprintId = "bp-1";
    component.newVersionName = "   ";

    component.createVersion();

    expect(versionService.createVersion).toHaveBeenCalledWith("bp-1", null);
  });

  it("restores a version and reloads", () => {
    component.blueprintId = "bp-1";
    const version = makeVersion();

    component.restoreVersion(version);

    expect(versionService.restoreVersion).toHaveBeenCalledWith("bp-1", "v1");
    expect(component.busyVersionId).toBe(null);
    expect(versionService.getVersions).toHaveBeenCalledWith("bp-1");
  });

  it("shows a specific toast when deleting the only remaining version fails with 400", () => {
    versionService.deleteVersion.mockReturnValue(
      throwError(() => ({ status: 400 }))
    );
    component.blueprintId = "bp-1";

    component.deleteVersion(makeVersion());

    expect(component.busyVersionId).toBe(null);
    expect(messageService.add).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "error",
        detail: "Cannot delete the only remaining version",
      })
    );
  });

  it("shows a generic toast for other delete failures", () => {
    versionService.deleteVersion.mockReturnValue(
      throwError(() => ({ status: 500 }))
    );
    component.blueprintId = "bp-1";

    component.deleteVersion(makeVersion());

    expect(messageService.add).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "error",
        detail: "Could not delete this version",
      })
    );
  });
});
