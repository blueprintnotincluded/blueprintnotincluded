import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";

import { Observable } from "rxjs";
import { map } from "rxjs/operators";

export interface UserDetails {
  _id: string;
  email: string;
  username: string;
  exp: number;
}

interface TokenResponse {
  token: string;
}

export interface TokenPayload {
  email: string;
  username: string;
  password: string;
}

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

  private request(
    method: "post" | "get",
    type: "login" | "register" | "profile",
    user?: TokenPayload
  ): Observable<any> {
    let base;

    if (method === "post") {
      base = this.http.post<TokenResponse>(`/api/${type}`, user);
    } else {
      base = this.http.get<TokenResponse>(`/api/${type}`, {
        headers: { Authorization: `Bearer ${this.getToken()}` },
      });
    }

    const request = base.pipe(
      map((data: TokenResponse) => {
        if (data.token) {
          this.saveToken(data.token);
        }
        return data;
      })
    );

    return request;
  }

  public register(user: TokenPayload): Observable<any> {
    return this.request("post", "register", user);
  }

  public login(user: TokenPayload): Observable<any> {
    return this.request("post", "login", user);
  }

  public profile(): Observable<any> {
    return this.request("get", "profile");
  }

  public logout(): void {
    this.token = "";
    window.localStorage.removeItem(AuthenticationService.localStorage);
  }

  public getSwitchAccountUrl(): Observable<{ url: string }> {
    return this.http.get<{ url: string }>("/api/auth/switch-account", {
      headers: { Authorization: `Bearer ${this.getToken()}` },
    });
  }

  public requestPasswordReset(email: string): Observable<any> {
    return this.http.post("/api/request-reset", { email });
  }

  public resetPassword(token: string, newPassword: string): Observable<any> {
    return this.http.post("/api/reset-password", {
      token,
      newPassword,
    });
  }
}
