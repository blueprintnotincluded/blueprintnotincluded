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
  AvatarGenerateResponse,
  AvatarStatusResponse,
  AvailableAvatarsResponse,
  AvatarSelectRequest,
  DlcPreferencesResponse,
  UpdateDlcPreferencesRequest,
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

  private authHeaders(): { [header: string]: string } {
    return { Authorization: `Bearer ${this.authService.getToken()}` };
  }

  // Private account state — which DLC packs the user wants hidden from
  // Discover. Never fetched or written for a logged-out visitor.
  getDlcPreferences(): Observable<DlcPreferencesResponse> {
    return this.http.get<DlcPreferencesResponse>(
      "/api/users/me/dlc-preferences",
      { headers: this.authHeaders() },
    );
  }

  updateDlcPreferences(
    excludedDlcs: string[],
  ): Observable<DlcPreferencesResponse> {
    const body: UpdateDlcPreferencesRequest = { excludedDlcs };
    return this.http.patch<DlcPreferencesResponse>(
      "/api/users/me/dlc-preferences",
      body,
      { headers: this.authHeaders() },
    );
  }

  getAvatarStatus(): Observable<AvatarStatusResponse> {
    return this.http.get<AvatarStatusResponse>("/api/users/me/avatar/status", {
      headers: this.authHeaders(),
    });
  }

  getAvailableAvatars(): Observable<AvailableAvatarsResponse> {
    return this.http.get<AvailableAvatarsResponse>("/api/avatars/available", {
      headers: this.authHeaders(),
    });
  }

  // Optional seed photo goes up as a raw image body; no body = random
  generateAvatar(seedFile: File | null): Observable<AvatarGenerateResponse> {
    const headers = seedFile
      ? { ...this.authHeaders(), "Content-Type": seedFile.type || "image/jpeg" }
      : this.authHeaders();
    return this.http.post<AvatarGenerateResponse>(
      "/api/users/me/avatar/generate",
      seedFile,
      { headers },
    );
  }

  selectAvatar(
    avatarId: string,
  ): Observable<{ avatarId: string; url: string }> {
    const body: AvatarSelectRequest = { avatarId };
    return this.http.post<{ avatarId: string; url: string }>(
      "/api/users/me/avatar/select",
      body,
      { headers: this.authHeaders() },
    );
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
