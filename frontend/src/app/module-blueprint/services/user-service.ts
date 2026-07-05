import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable } from "rxjs";
import { AuthenticationService } from "./authentification-service";
import {
  ProfileResponse,
  FollowRequest,
  UpdateBioRequest,
  BlueprintListResponse,
} from "../../../../../lib/index";

@Injectable({ providedIn: "root" })
export class UserService {
  constructor(
    private http: HttpClient,
    private authService: AuthenticationService
  ) {}

  getProfile(username: string): Observable<ProfileResponse> {
    const url = this.authService.isLoggedIn()
      ? `/api/users/${username}/profileSecure`
      : `/api/users/${username}/profile`;

    return this.http.get<ProfileResponse>(url, {
      headers: this.authService.isLoggedIn()
        ? { Authorization: `Bearer ${this.authService.getToken()}` }
        : {},
    });
  }

  follow(followeeId: string, follow: boolean): Observable<{ follow: string }> {
    const body: FollowRequest = { followeeId, follow };
    return this.http.post<{ follow: string }>("/api/follow", body, {
      headers: { Authorization: `Bearer ${this.authService.getToken()}` },
    });
  }

  updateBio(bio: string): Observable<{ bio: string }> {
    const body: UpdateBioRequest = { bio };
    return this.http.patch<{ bio: string }>("/api/users/me", body, {
      headers: { Authorization: `Bearer ${this.authService.getToken()}` },
    });
  }

  getFeed(olderThan: Date): Observable<BlueprintListResponse> {
    const params = "olderthan=" + olderThan.getTime().toString();
    return this.http.get<BlueprintListResponse>(`/api/feed?${params}`, {
      headers: { Authorization: `Bearer ${this.authService.getToken()}` },
    });
  }
}
