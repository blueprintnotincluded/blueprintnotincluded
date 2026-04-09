import { Injectable } from "@angular/core";

const TOKEN_KEY = "blueprintnotincluded-token";

export interface AdminUser {
  _id: string;
  email: string;
  username: string;
  exp: number;
  role?: string;
}

@Injectable({ providedIn: "root" })
export class AdminAuthService {
  constructor() {
    // In dev the admin app runs on a different port than the main app, so
    // localStorage isn't shared. Accept ?token= in the URL as a handoff.
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
      params.delete("token");
      const newSearch = params.toString();
      const newUrl =
        window.location.pathname +
        (newSearch ? "?" + newSearch : "") +
        window.location.hash;
      window.history.replaceState(null, "", newUrl);
    }
  }

  private parseToken(): AdminUser | null {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return null;
    try {
      const payload = JSON.parse(window.atob(token.split(".")[1]));
      return payload as AdminUser;
    } catch {
      return null;
    }
  }

  public getUser(): AdminUser | null {
    const user = this.parseToken();
    if (!user) return null;
    if (user.exp < Date.now() / 1000) return null;
    return user;
  }

  public isAdmin(): boolean {
    return this.getUser()?.role === "admin";
  }

  public getToken(): string {
    return localStorage.getItem(TOKEN_KEY) ?? "";
  }
}
