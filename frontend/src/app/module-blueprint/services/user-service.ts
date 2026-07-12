import { Injectable } from "@angular/core";
import { HttpClient, HttpParams } from "@angular/common/http";
import { Observable, throwError } from "rxjs";
import { AuthenticationService } from "./authentification-service";
import {
  ProfileResponse,
  FollowRequest,
  UpdateBioRequest,
  BlueprintListResponse,
  FollowListResponse,
} from "../../../../../lib/index";

@Injectable({ providedIn: "root" })
export class UserService {
  constructor(
    private http: HttpClient,
    private authService: AuthenticationService,
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
    if (!this.authService.isLoggedIn()) {
      return throwError(() => new Error("Not authenticated"));
    }
    const body: FollowRequest = { followeeId, follow };
    return this.http.post<{ follow: string }>("/api/follow", body, {
      headers: { Authorization: `Bearer ${this.authService.getToken()}` },
    });
  }

  updateBio(bio: string): Observable<{ bio: string }> {
    if (!this.authService.isLoggedIn()) {
      return throwError(() => new Error("Not authenticated"));
    }
    const body: UpdateBioRequest = { bio };
    return this.http.patch<{ bio: string }>("/api/users/me", body, {
      headers: { Authorization: `Bearer ${this.authService.getToken()}` },
    });
  }

  private getConnections(
    username: string,
    mode: "followers" | "following",
    olderThan: Date,
  ): Observable<FollowListResponse> {
    const params = new HttpParams().set(
      "olderthan",
      olderThan.getTime().toString(),
    );
    return this.http.get<FollowListResponse>(`/api/users/${username}/${mode}`, {
      params,
      headers: this.authService.isLoggedIn()
        ? { Authorization: `Bearer ${this.authService.getToken()}` }
        : {},
    });
  }

  getFollowers(
    username: string,
    olderThan: Date,
  ): Observable<FollowListResponse> {
    return this.getConnections(username, "followers", olderThan);
  }

  getFollowing(
    username: string,
    olderThan: Date,
  ): Observable<FollowListResponse> {
    return this.getConnections(username, "following", olderThan);
  }

  getFeed(olderThan: Date): Observable<BlueprintListResponse> {
    const params = new HttpParams().set(
      "olderthan",
      olderThan.getTime().toString(),
    );
    return this.http.get<BlueprintListResponse>("/api/feed", {
      params,
      headers: { Authorization: `Bearer ${this.authService.getToken()}` },
    });
  }
}
