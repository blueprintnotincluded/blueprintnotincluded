import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable } from "rxjs";
import {
  ForkBlueprintResponse,
  ListBlueprintVersionsResponse,
  CreateBlueprintVersionResponse,
  DeleteBlueprintVersionResponse,
} from "../../../../../lib/index";
import { AuthenticationService } from "./authentification-service";

@Injectable()
export class BlueprintVersionService {
  constructor(
    private http: HttpClient,
    private auth: AuthenticationService,
  ) {}

  public fork(blueprintId: string): Observable<ForkBlueprintResponse> {
    return this.http.post<ForkBlueprintResponse>(
      `/api/blueprints/${blueprintId}/fork`,
      {},
      { headers: this.authHeaders() },
    );
  }

  public getVersions(
    blueprintId: string,
  ): Observable<ListBlueprintVersionsResponse> {
    // Token is optional but required to list versions of your own drafts —
    // the backend 404s draft blueprints for anonymous viewers
    return this.http.get<ListBlueprintVersionsResponse>(
      `/api/blueprints/${blueprintId}/versions`,
      this.auth.isLoggedIn() ? { headers: this.authHeaders() } : {},
    );
  }

  public createVersion(
    blueprintId: string,
    name?: string | null,
  ): Observable<CreateBlueprintVersionResponse> {
    return this.http.post<CreateBlueprintVersionResponse>(
      `/api/blueprints/${blueprintId}/versions`,
      name != null ? { name } : {},
      { headers: this.authHeaders() },
    );
  }

  public restoreVersion(
    blueprintId: string,
    versionId: string,
  ): Observable<CreateBlueprintVersionResponse> {
    return this.http.post<CreateBlueprintVersionResponse>(
      `/api/blueprints/${blueprintId}/versions/${versionId}/restore`,
      {},
      { headers: this.authHeaders() },
    );
  }

  public deleteVersion(
    blueprintId: string,
    versionId: string,
  ): Observable<DeleteBlueprintVersionResponse> {
    return this.http.delete<DeleteBlueprintVersionResponse>(
      `/api/blueprints/${blueprintId}/versions/${versionId}`,
      { headers: this.authHeaders() },
    );
  }

  private authHeaders() {
    return { Authorization: `Bearer ${this.auth.getToken()}` };
  }
}
