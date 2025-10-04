import { TestBed } from "@angular/core/testing";
import {
  HttpClientTestingModule,
  HttpTestingController,
} from "@angular/common/http/testing";
import { of, throwError } from "rxjs";

import { VersionService, VersionInfo } from "./version.service";

describe("VersionService", () => {
  let service: VersionService;
  let httpMock: HttpTestingController;

  const mockVersionInfo: VersionInfo = {
    version: "1.2.3",
    name: "blueprintnotincluded",
    buildTime: "2024-01-15T10:30:00Z",
    buildCommit: "abc123def4567890123456789012345678901234",
    buildBranch: "main",
    environment: "production",
    nodeVersion: "v20.18.0",
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [VersionService],
    });
    service = TestBed.inject(VersionService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it("should be created", () => {
    expect(service).toBeTruthy();
  });

  describe("getVersionInfo", () => {
    it("should return version information from API", async () => {
      const versionPromise = service.getVersionInfo();

      const req = httpMock.expectOne("/api/version");
      expect(req.request.method).toBe("GET");
      req.flush(mockVersionInfo);

      const result = await versionPromise;
      expect(result).toEqual(mockVersionInfo);
    });

    it("should cache version information on subsequent calls", async () => {
      // First call
      const versionPromise1 = service.getVersionInfo();
      const req1 = httpMock.expectOne("/api/version");
      req1.flush(mockVersionInfo);
      await versionPromise1;

      // Second call should not make HTTP request
      const versionPromise2 = service.getVersionInfo();
      const result2 = await versionPromise2;

      expect(result2).toEqual(mockVersionInfo);
      httpMock.expectNone("/api/version");
    });

    it("should handle API errors gracefully", async () => {
      const versionPromise = service.getVersionInfo();

      const req = httpMock.expectOne("/api/version");
      req.flush("Server Error", {
        status: 500,
        statusText: "Internal Server Error",
      });

      const result = await versionPromise;
      expect(result.error).toBe("Failed to fetch version information");
      expect(result.version).toBe("unknown");
      expect(result.name).toBe("blueprintnotincluded");
    });

    it("should handle network errors gracefully", async () => {
      const versionPromise = service.getVersionInfo();

      const req = httpMock.expectOne("/api/version");
      req.error(new ErrorEvent("Network error"));

      const result = await versionPromise;
      expect(result.error).toBe("Failed to fetch version information");
      expect(result.version).toBe("unknown");
    });
  });

  describe("getVersionString", () => {
    it("should return formatted version string", async () => {
      const versionPromise = service.getVersionString();

      const req = httpMock.expectOne("/api/version");
      req.flush(mockVersionInfo);

      const result = await versionPromise;
      expect(result).toBe("Version 1.2.3 (abc123d)");
    });

    it("should include environment for non-production", async () => {
      const testVersionInfo = {
        ...mockVersionInfo,
        environment: "development",
      };
      const versionPromise = service.getVersionString();

      const req = httpMock.expectOne("/api/version");
      req.flush(testVersionInfo);

      const result = await versionPromise;
      expect(result).toBe("Version 1.2.3 (abc123d) [development]");
    });

    it("should handle missing commit hash", async () => {
      const testVersionInfo = { ...mockVersionInfo, buildCommit: undefined };
      const versionPromise = service.getVersionString();

      const req = httpMock.expectOne("/api/version");
      req.flush(testVersionInfo);

      const result = await versionPromise;
      expect(result).toBe("Version 1.2.3");
    });

    it("should handle errors in version string", async () => {
      const versionPromise = service.getVersionString();

      const req = httpMock.expectOne("/api/version");
      req.flush("Server Error", {
        status: 500,
        statusText: "Internal Server Error",
      });

      const result = await versionPromise;
      expect(result).toBe(
        "Version unknown (Error: Failed to fetch version information)"
      );
    });
  });

  describe("getDetailedVersionInfo", () => {
    it("should return detailed version information", async () => {
      const versionPromise = service.getDetailedVersionInfo();

      const req = httpMock.expectOne("/api/version");
      req.flush(mockVersionInfo);

      const result = await versionPromise;
      expect(result).toContain("Version: 1.2.3");
      expect(result).toContain("Environment: production");
      expect(result).toContain("Build Time: 1/15/2024");
      expect(result).toContain(
        "Commit: abc123def4567890123456789012345678901234"
      );
      expect(result).toContain("Branch: main");
      expect(result).toContain("Node.js: v20.18.0");
    });

    it("should handle missing optional fields", async () => {
      const testVersionInfo = {
        ...mockVersionInfo,
        buildCommit: undefined,
        buildBranch: undefined,
      };
      const versionPromise = service.getDetailedVersionInfo();

      const req = httpMock.expectOne("/api/version");
      req.flush(testVersionInfo);

      const result = await versionPromise;
      expect(result).toContain("Version: 1.2.3");
      expect(result).toContain("Environment: production");
      expect(result).toContain("Build Time: 1/15/2024");
      expect(result).not.toContain("Commit:");
      expect(result).not.toContain("Branch:");
      expect(result).toContain("Node.js: v20.18.0");
    });

    it("should include error information when present", async () => {
      const testVersionInfo = {
        ...mockVersionInfo,
        error: "Test error message",
      };
      const versionPromise = service.getDetailedVersionInfo();

      const req = httpMock.expectOne("/api/version");
      req.flush(testVersionInfo);

      const result = await versionPromise;
      expect(result).toContain("Error: Test error message");
    });

    it("should handle API errors in detailed info", async () => {
      const versionPromise = service.getDetailedVersionInfo();

      const req = httpMock.expectOne("/api/version");
      req.flush("Server Error", {
        status: 500,
        statusText: "Internal Server Error",
      });

      const result = await versionPromise;
      expect(result).toContain("Version: unknown");
      expect(result).toContain("Environment: development");
      expect(result).toContain("Error: Failed to fetch version information");
    });
  });

  describe("caching behavior", () => {
    it("should return the same promise for concurrent calls", () => {
      const promise1 = service.getVersionInfo();
      const promise2 = service.getVersionInfo();

      expect(promise1).toBe(promise2);

      const req = httpMock.expectOne("/api/version");
      req.flush(mockVersionInfo);
    });

    it("should make new request after cache is cleared", async () => {
      // First call
      const versionPromise1 = service.getVersionInfo();
      const req1 = httpMock.expectOne("/api/version");
      req1.flush(mockVersionInfo);
      await versionPromise1;

      // Clear cache by accessing private property (for testing)
      (service as any).versionInfo = null;
      (service as any).versionPromise = null;

      // Second call should make new request
      const versionPromise2 = service.getVersionInfo();
      const req2 = httpMock.expectOne("/api/version");
      req2.flush(mockVersionInfo);
      await versionPromise2;

      expect(versionPromise1).not.toBe(versionPromise2);
    });
  });
});
