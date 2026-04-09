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
    // localStorage isn't shared. Accept ?token= in the URL as a handoff,
    // then immediately remove it from the address bar.
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

  /** Decode a base64url-encoded JWT payload segment correctly. */
  private decodeJwtPayload(token: string): Record<string, unknown> | null {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    try {
      // JWT uses base64url (RFC 4648 §5): '-' instead of '+', '_' instead of
      // '/', and no padding.  atob() requires standard base64 with padding.
      const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
      return JSON.parse(atob(padded));
    } catch {
      return null;
    }
  }

  private parseToken(): AdminUser | null {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return null;
    const payload = this.decodeJwtPayload(token);
    if (!payload) return null;
    return payload as unknown as AdminUser;
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
