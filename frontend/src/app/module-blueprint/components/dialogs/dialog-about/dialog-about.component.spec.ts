import { ComponentFixture, TestBed } from "@angular/core/testing";
import { HttpClientTestingModule } from "@angular/common/http/testing";
import { of } from "rxjs";

import { DialogAboutComponent } from "./dialog-about.component";
import {
  VersionService,
  VersionInfo,
} from "../../../../services/version.service";

describe("DialogAboutComponent", () => {
  let component: DialogAboutComponent;
  let fixture: ComponentFixture<DialogAboutComponent>;
  let mockVersionService: jasmine.SpyObj<VersionService>;

  const mockVersionInfo: VersionInfo = {
    version: "1.2.3",
    name: "blueprintnotincluded",
    buildTime: "2024-01-15T10:30:00Z",
    buildCommit: "abc123def4567890123456789012345678901234",
    buildBranch: "main",
    environment: "production",
    nodeVersion: "v20.18.0",
  };

  beforeEach(async () => {
    const versionServiceSpy = jasmine.createSpyObj("VersionService", [
      "getVersionString",
      "getDetailedVersionInfo",
    ]);

    versionServiceSpy.getVersionString.and.returnValue(
      Promise.resolve("Version 1.2.3 (abc123d)")
    );
    versionServiceSpy.getDetailedVersionInfo.and.returnValue(
      Promise.resolve(
        "Version: 1.2.3\nEnvironment: production\nBuild Time: 1/15/2024\nCommit: abc123def4567890123456789012345678901234\nBranch: main\nNode.js: v20.18.0"
      )
    );

    await TestBed.configureTestingModule({
      declarations: [DialogAboutComponent],
      imports: [HttpClientTestingModule],
      providers: [{ provide: VersionService, useValue: versionServiceSpy }],
    }).compileComponents();

    fixture = TestBed.createComponent(DialogAboutComponent);
    component = fixture.componentInstance;
    mockVersionService = TestBed.inject(
      VersionService
    ) as jasmine.SpyObj<VersionService>;
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("should initialize with loading state", () => {
    expect(component.versionString).toBe("Loading...");
    expect(component.detailedVersionInfo).toBe("");
  });

  it("should load version information on init", async () => {
    component.ngOnInit();

    // Wait for promises to resolve
    await fixture.whenStable();

    expect(mockVersionService.getVersionString).toHaveBeenCalled();
    expect(mockVersionService.getDetailedVersionInfo).toHaveBeenCalled();
    expect(component.versionString).toBe("Version 1.2.3 (abc123d)");
    expect(component.detailedVersionInfo).toContain("Version: 1.2.3");
  });

  it("should toggle dialog visibility", () => {
    component.visible = false;
    component.toggleDialog();
    expect(component.visible).toBe(true);

    component.toggleDialog();
    expect(component.visible).toBe(false);
  });

  it("should close dialog", () => {
    component.visible = true;
    component.close();
    expect(component.visible).toBe(false);
  });

  it("should handle version service errors gracefully", async () => {
    mockVersionService.getVersionString.and.returnValue(
      Promise.resolve("Version unknown (Error: Failed to fetch)")
    );
    mockVersionService.getDetailedVersionInfo.and.returnValue(
      Promise.resolve("Version: unknown\nError: Failed to fetch")
    );

    component.ngOnInit();
    await fixture.whenStable();

    expect(component.versionString).toBe(
      "Version unknown (Error: Failed to fetch)"
    );
    expect(component.detailedVersionInfo).toContain("Error: Failed to fetch");
  });

  it("should call loadVersionInfo on ngOnInit", () => {
    spyOn(component as any, "loadVersionInfo");
    component.ngOnInit();
    expect((component as any).loadVersionInfo).toHaveBeenCalled();
  });
});
