import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";

import { Observable } from "rxjs";
import { catchError, map } from "rxjs/operators";

export interface UserDetails {
  _id: string;
  email: string;
  username: string;
  exp: number;
  role?: string;
  isAlpha?: boolean;
}

export type LoginResult =
  | { kind: "success"; token: string }
  | { kind: "legacy_account" }
  | { kind: "invalid_credentials" };

@Injectable()
export class AuthenticationService {
  private static localStorage: string = "blueprintnotincluded-token";

  private token: string = "";

  constructor(private http: HttpClient) {}

  public saveToken(token: string): void {
    localStorage.setItem(AuthenticationService.localStorage, token);
    this.token = token;
  }

  public getToken(): string {
    if (!this.token) {
      this.token =
        localStorage.getItem(AuthenticationService.localStorage) || "";
    }
    return this.token;
  }

  public getUserDetails(): UserDetails | null {
    const token = this.getToken();
    let payload;
    if (token) {
      payload = token.split(".")[1];
      payload = window.atob(payload);
      return JSON.parse(payload);
    } else {
      return null;
    }
  }

  public isLoggedIn(): boolean {
    const user = this.getUserDetails();
    if (user) {
      return user.exp > Date.now() / 1000;
    } else {
      return false;
    }
  }

  public isAlpha(): boolean {
    return this.getUserDetails()?.isAlpha === true;
  }

  public toggleAlpha(): Observable<string> {
    return this.http
      .post<{ token: string }>("/api/admin/alpha/toggle", {})
      .pipe(map((res) => res.token));
  }

  public logout(): void {
    this.token = "";
    window.localStorage.removeItem(AuthenticationService.localStorage);
  }

  // ─── Auth methods ─────────────────────────────────────────────────────────

  public loginWithPassword(
    email: string,
    password: string
  ): Observable<LoginResult> {
    return this.http
      .post<{ token: string }>("/api/auth/login", { email, password })
      .pipe(
        map((res) => ({ kind: "success" as const, token: res.token })),
        catchError((err) => {
          const error = err?.error?.error;
          if (error === "legacy_account") {
            return [{ kind: "legacy_account" as const }];
          }
          return [{ kind: "invalid_credentials" as const }];
        })
      );
  }

  public registerWithPassword(
    email: string,
    password: string,
    username: string
  ): Observable<{ message: string; userId: string }> {
    return this.http.post<{ message: string; userId: string }>(
      "/api/auth/register",
      { email, password, username }
    );
  }

  public verifyEmail(
    code: string,
    userId: string
  ): Observable<{ token: string }> {
    return this.http.post<{ token: string }>("/api/auth/verify-email", {
      code,
      userId,
    });
  }

  public sendMagicLink(email: string): Observable<void> {
    return this.http
      .post<void>("/api/auth/send-magic", { email })
      .pipe(map(() => undefined));
  }

  public verifyMagicCode(
    code: string,
    email: string
  ): Observable<{ token: string }> {
    return this.http.post<{ token: string }>("/api/auth/verify-magic", {
      code,
      email,
    });
  }

  public forgotPassword(email: string): Observable<void> {
    return this.http
      .post<void>("/api/auth/forgot-password", { email })
      .pipe(map(() => undefined));
  }

  public resetPasswordWithToken(
    token: string,
    newPassword: string
  ): Observable<void> {
    return this.http
      .post<void>("/api/auth/reset-password", { token, newPassword })
      .pipe(map(() => undefined));
  }
}
