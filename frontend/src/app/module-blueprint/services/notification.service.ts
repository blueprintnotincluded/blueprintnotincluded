import { Injectable } from "@angular/core";
import { HttpClient, HttpParams } from "@angular/common/http";
import { Observable } from "rxjs";
import { AuthenticationService } from "./authentification-service";
import { NotificationListResponse } from "../../../../../lib/index";

@Injectable({ providedIn: "root" })
export class NotificationService {
  constructor(
    private http: HttpClient,
    private authService: AuthenticationService,
  ) {}

  private authHeaders() {
    return { Authorization: `Bearer ${this.authService.getToken()}` };
  }

  list(olderThan: Date): Observable<NotificationListResponse> {
    const params = new HttpParams().set(
      "olderthan",
      olderThan.getTime().toString(),
    );
    return this.http.get<NotificationListResponse>("/api/notifications", {
      params,
      headers: this.authHeaders(),
    });
  }

  markAllRead(): Observable<{ markRead: string }> {
    return this.http.post<{ markRead: string }>(
      "/api/notifications/mark-read",
      {},
      { headers: this.authHeaders() },
    );
  }
}
