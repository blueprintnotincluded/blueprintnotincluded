import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NO_ERRORS_SCHEMA } from "@angular/core";
import { provideHttpClientTesting } from "@angular/common/http/testing";

import { DialogAboutComponent } from "./dialog-about.component";
import { VersionService } from "../../../../services/version.service";
import {
  provideHttpClient,
  withInterceptorsFromDi,
} from "@angular/common/http";

type VersionServiceSpy = {
  getVersionString: ReturnType<typeof vi.fn>;
  getDetailedVersionInfo: ReturnType<typeof vi.fn>;
};

describe("DialogAboutComponent", () => {
  let component: DialogAboutComponent;
  let fixture: ComponentFixture<DialogAboutComponent>;
  let mockVersionService: VersionServiceSpy;

  beforeEach(async () => {
    const versionServiceSpy: VersionServiceSpy = {
      getVersionString: vi.fn().mockResolvedValue("Version 1.2.3 (abc123d)"),
      getDetailedVersionInfo: vi
        .fn()
        .mockResolvedValue(
          "Version: 1.2.3\nEnvironment: production\nBuild Time: 1/15/2024\nCommit: abc123def4567890123456789012345678901234\nBranch: main\nNode.js: v20.18.0",
        ),
    };

    await TestBed.configureTestingModule({
      declarations: [DialogAboutComponent],
      imports: [],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: VersionService, useValue: versionServiceSpy },
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DialogAboutComponent);
    component = fixture.componentInstance;
    mockVersionService = TestBed.inject(
      VersionService,
    ) as unknown as VersionServiceSpy;
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

  it("should handle version service errors gracefully", async () => {
    mockVersionService.getVersionString.mockResolvedValue(
      "Version unknown (Error: Failed to fetch)",
    );
    mockVersionService.getDetailedVersionInfo.mockResolvedValue(
      "Version: unknown\nError: Failed to fetch",
    );

    component.ngOnInit();
    await fixture.whenStable();

    expect(component.versionString).toBe(
      "Version unknown (Error: Failed to fetch)",
    );
    expect(component.detailedVersionInfo).toContain("Error: Failed to fetch");
  });

  it("should call loadVersionInfo on ngOnInit", () => {
    const spy = vi.spyOn(component as any, "loadVersionInfo");
    component.ngOnInit();
    expect(spy).toHaveBeenCalled();
  });
});
