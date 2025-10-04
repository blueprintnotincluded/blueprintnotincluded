import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable, of } from "rxjs";
import { catchError, map } from "rxjs/operators";

export interface VersionInfo {
  version: string;
  name: string;
  buildTime: string;
  buildCommit?: string;
  buildBranch?: string;
  environment: string;
  nodeVersion: string;
  error?: string;
}

@Injectable({
  providedIn: "root",
})
export class VersionService {
  private versionInfo: VersionInfo | null = null;
  private versionPromise: Promise<VersionInfo> | null = null;

  constructor(private http: HttpClient) {}

  getVersionInfo(): Promise<VersionInfo> {
    if (this.versionInfo) {
      return Promise.resolve(this.versionInfo);
    }

    if (this.versionPromise) {
      return this.versionPromise;
    }

    this.versionPromise = this.http
      .get<VersionInfo>("/api/version")
      .pipe(
        map((version) => {
          this.versionInfo = version;
          return version;
        }),
        catchError((error) => {
          console.error("Failed to fetch version info:", error);
          // Return fallback version info
          const fallbackVersion: VersionInfo = {
            version: "unknown",
            name: "blueprintnotincluded",
            buildTime: new Date().toISOString(),
            environment: "development",
            nodeVersion: "unknown",
            error: "Failed to fetch version information",
          };
          this.versionInfo = fallbackVersion;
          return of(fallbackVersion);
        })
      )
      .toPromise() as Promise<VersionInfo>;

    return this.versionPromise;
  }

  getVersionString(): Promise<string> {
    return this.getVersionInfo().then((info) => {
      if (info.error) {
        return `Version ${info.version} (Error: ${info.error})`;
      }

      let versionString = `Version ${info.version}`;

      if (info.buildCommit) {
        versionString += ` (${info.buildCommit.substring(0, 7)})`;
      }

      if (info.environment !== "production") {
        versionString += ` [${info.environment}]`;
      }

      return versionString;
    });
  }

  getDetailedVersionInfo(): Promise<string> {
    return this.getVersionInfo().then((info) => {
      let details = `Version: ${info.version}\n`;
      details += `Environment: ${info.environment}\n`;
      details += `Build Time: ${new Date(info.buildTime).toLocaleString()}\n`;

      if (info.buildCommit) {
        details += `Commit: ${info.buildCommit}\n`;
      }

      if (info.buildBranch) {
        details += `Branch: ${info.buildBranch}\n`;
      }

      details += `Node.js: ${info.nodeVersion}`;

      if (info.error) {
        details += `\nError: ${info.error}`;
      }

      return details;
    });
  }
}
