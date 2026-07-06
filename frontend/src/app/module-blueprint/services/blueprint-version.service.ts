import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable } from "rxjs";
import {
  ForkBlueprintResponse,
  ListBlueprintVersionsResponse,
  CreateBlueprintVersionResponse,
} from "../../../../../lib/index";
import { AuthenticationService } from "./authentification-service";

@Injectable()
export class BlueprintVersionService {
  constructor(private http: HttpClient, private auth: AuthenticationService) {}

  public fork(blueprintId: string): Observable<ForkBlueprintResponse> {
    return this.http.post<ForkBlueprintResponse>(
      `/api/blueprints/${blueprintId}/fork`,
      {},
      { headers: this.authHeaders() }
    );
  }

  public getVersions(
    blueprintId: string
  ): Observable<ListBlueprintVersionsResponse> {
    return this.http.get<ListBlueprintVersionsResponse>(
      `/api/blueprints/${blueprintId}/versions`
    );
  }

  public createVersion(
    blueprintId: string,
    name?: string | null
  ): Observable<CreateBlueprintVersionResponse> {
    return this.http.post<CreateBlueprintVersionResponse>(
      `/api/blueprints/${blueprintId}/versions`,
      name != null ? { name } : {},
      { headers: this.authHeaders() }
    );
  }

  public restoreVersion(
    blueprintId: string,
    versionId: string
  ): Observable<CreateBlueprintVersionResponse> {
    return this.http.post<CreateBlueprintVersionResponse>(
      `/api/blueprints/${blueprintId}/versions/${versionId}/restore`,
      {},
      { headers: this.authHeaders() }
    );
  }

  public deleteVersion(
    blueprintId: string,
    versionId: string
  ): Observable<{ deleteVersion: string }> {
    return this.http.delete<{ deleteVersion: string }>(
      `/api/blueprints/${blueprintId}/versions/${versionId}`,
      { headers: this.authHeaders() }
    );
  }

  private authHeaders() {
    return { Authorization: `Bearer ${this.auth.getToken()}` };
  }
}
