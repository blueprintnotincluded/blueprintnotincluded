import { TestBed } from "@angular/core/testing";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import {
  provideHttpClient,
  withInterceptorsFromDi,
} from "@angular/common/http";

import { AuthenticationService } from "./authentification-service";

const makeJwt = (payload: object): string => {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.sig`;
};

const makeJwtUrl = (payload: object): string => {
  const encode = (obj: object) =>
    btoa(JSON.stringify(obj))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(payload)}.sig`;
};

const FUTURE_EXP = Math.floor(Date.now() / 1000) + 3600;
const PAST_EXP = Math.floor(Date.now() / 1000) - 3600;

describe("AuthenticationService", () => {
  let service: AuthenticationService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        AuthenticationService,
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(AuthenticationService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  describe("saveToken / getToken", () => {
    it("saves and retrieves a token from memory", () => {
      service.saveToken("abc123");
      expect(service.getToken()).toBe("abc123");
    });

    it("reads token from localStorage when in-memory token is empty", () => {
      localStorage.setItem("blueprintnotincluded-token", "stored-token");
      (service as any).token = "";
      expect(service.getToken()).toBe("stored-token");
    });

    it("returns empty string when no token anywhere", () => {
      expect(service.getToken()).toBe("");
    });
  });

  describe("getUserDetails", () => {
    it("returns null when no token", () => {
      expect(service.getUserDetails()).toBeNull();
    });

    it("decodes a valid JWT payload", () => {
      const payload = {
        _id: "u1",
        email: "a@b.com",
        username: "alice",
        exp: FUTURE_EXP,
      };
      service.saveToken(makeJwt(payload));
      const details = service.getUserDetails();
      expect(details).not.toBeNull();
      expect(details!._id).toBe("u1");
      expect(details!.email).toBe("a@b.com");
      expect(details!.username).toBe("alice");
      expect(details!.exp).toBe(FUTURE_EXP);
    });

    it("includes optional role field when present", () => {
      const payload = {
        _id: "u2",
        email: "b@c.com",
        username: "bob",
        exp: FUTURE_EXP,
        role: "admin",
      };
      service.saveToken(makeJwt(payload));
      expect(service.getUserDetails()!.role).toBe("admin");
    });

    it("decodes a base64url-encoded JWT payload", () => {
      const payload = {
        _id: "u3",
        email: "c@d.com",
        username: "carol",
        exp: FUTURE_EXP,
      };
      service.saveToken(makeJwtUrl(payload));
      const details = service.getUserDetails();
      expect(details).not.toBeNull();
      expect(details!._id).toBe("u3");
      expect(details!.username).toBe("carol");
    });

    it("returns null and clears localStorage when token is malformed", () => {
      localStorage.setItem("blueprintnotincluded-token", "not.a.valid.jwt");
      (service as any).token = "not.a.valid.jwt";
      expect(service.getUserDetails()).toBeNull();
      expect(localStorage.getItem("blueprintnotincluded-token")).toBeNull();
    });

    it("isAlpha returns false instead of throwing on malformed token", () => {
      localStorage.setItem("blueprintnotincluded-token", "bad-token");
      (service as any).token = "bad-token";
      expect(() => service.isAlpha()).not.toThrow();
      expect(service.isAlpha()).toBe(false);
    });
  });

  describe("isLoggedIn", () => {
    it("returns false when no token", () => {
      expect(service.isLoggedIn()).toBe(false);
    });

    it("returns true for a non-expired token", () => {
      service.saveToken(
        makeJwt({
          _id: "u1",
          email: "a@b.com",
          username: "alice",
          exp: FUTURE_EXP,
        })
      );
      expect(service.isLoggedIn()).toBe(true);
    });

    it("returns false for an expired token", () => {
      service.saveToken(
        makeJwt({
          _id: "u1",
          email: "a@b.com",
          username: "alice",
          exp: PAST_EXP,
        })
      );
      expect(service.isLoggedIn()).toBe(false);
    });
  });

  describe("isAlpha", () => {
    it("returns false when no token (guest)", () => {
      expect(service.isAlpha()).toBe(false);
    });

    it("returns true for a logged-in alpha user", () => {
      service.saveToken(
        makeJwt({
          _id: "u1",
          email: "a@b.com",
          username: "alice",
          exp: FUTURE_EXP,
          isAlpha: true,
        })
      );
      expect(service.isAlpha()).toBe(true);
    });

    it("returns false for an expired alpha token (stale cookie)", () => {
      service.saveToken(
        makeJwt({
          _id: "u1",
          email: "a@b.com",
          username: "alice",
          exp: PAST_EXP,
          isAlpha: true,
        })
      );
      expect(service.isAlpha()).toBe(false);
    });
  });

  describe("logout", () => {
    it("clears in-memory token", () => {
      service.saveToken("token123");
      service.logout();
      expect(service.getToken()).toBe("");
    });

    it("removes token from localStorage", () => {
      service.saveToken("token123");
      service.logout();
      expect(localStorage.getItem("blueprintnotincluded-token")).toBeNull();
    });
  });

  describe("loginWithPassword", () => {
    it("returns success with token on 200", () => {
      let result: any;
      service
        .loginWithPassword("a@b.com", "pass")
        .subscribe((r) => (result = r));
      const req = httpMock.expectOne("/api/auth/login");
      expect(req.request.method).toBe("POST");
      expect(req.request.body).toEqual({ email: "a@b.com", password: "pass" });
      req.flush({ token: "jwt-token" });
      expect(result).toEqual({ kind: "success", token: "jwt-token" });
    });

    it("returns legacy_account when server error says so", () => {
      let result: any;
      service
        .loginWithPassword("a@b.com", "pass")
        .subscribe((r) => (result = r));
      httpMock
        .expectOne("/api/auth/login")
        .flush(
          { error: "legacy_account" },
          { status: 401, statusText: "Unauthorized" }
        );
      expect(result).toEqual({ kind: "legacy_account" });
    });

    it("returns invalid_credentials on any other error", () => {
      let result: any;
      service
        .loginWithPassword("a@b.com", "pass")
        .subscribe((r) => (result = r));
      httpMock
        .expectOne("/api/auth/login")
        .flush(
          { error: "bad_credentials" },
          { status: 401, statusText: "Unauthorized" }
        );
      expect(result).toEqual({ kind: "invalid_credentials" });
    });

    it("returns invalid_credentials on network error", () => {
      let result: any;
      service
        .loginWithPassword("a@b.com", "pass")
        .subscribe((r) => (result = r));
      httpMock
        .expectOne("/api/auth/login")
        .error(new ErrorEvent("network error"));
      expect(result).toEqual({ kind: "invalid_credentials" });
    });
  });

  describe("registerWithPassword", () => {
    it("posts credentials and returns userId", () => {
      let result: any;
      service
        .registerWithPassword("a@b.com", "pass", "alice")
        .subscribe((r) => (result = r));
      const req = httpMock.expectOne("/api/auth/register");
      expect(req.request.body).toEqual({
        email: "a@b.com",
        password: "pass",
        username: "alice",
      });
      req.flush({ message: "ok", userId: "u1" });
      expect(result).toEqual({ message: "ok", userId: "u1" });
    });
  });

  describe("verifyEmail", () => {
    it("posts code+userId and returns token", () => {
      let result: any;
      service
        .verifyEmail("code456", "userId123")
        .subscribe((r) => (result = r));
      const req = httpMock.expectOne("/api/auth/verify-email");
      expect(req.request.body).toEqual({
        code: "code456",
        userId: "userId123",
      });
      req.flush({ token: "jwt-token" });
      expect(result).toEqual({ token: "jwt-token" });
    });
  });

  describe("sendMagicLink", () => {
    it("posts email and completes with void", () => {
      let emitted: unknown = "NOT_CALLED";
      service.sendMagicLink("a@b.com").subscribe((v) => (emitted = v));
      const req = httpMock.expectOne("/api/auth/send-magic");
      expect(req.request.body).toEqual({ email: "a@b.com" });
      req.flush(null);
      expect(emitted).toBeUndefined();
    });
  });

  describe("verifyMagicCode", () => {
    it("posts code+email and returns token", () => {
      let result: any;
      service
        .verifyMagicCode("code123", "a@b.com")
        .subscribe((r) => (result = r));
      const req = httpMock.expectOne("/api/auth/verify-magic");
      expect(req.request.body).toEqual({ code: "code123", email: "a@b.com" });
      req.flush({ token: "magic-jwt" });
      expect(result).toEqual({ token: "magic-jwt" });
    });
  });

  describe("forgotPassword", () => {
    it("posts email and completes with void", () => {
      let emitted: unknown = "NOT_CALLED";
      service.forgotPassword("a@b.com").subscribe((v) => (emitted = v));
      const req = httpMock.expectOne("/api/auth/forgot-password");
      expect(req.request.body).toEqual({ email: "a@b.com" });
      req.flush(null);
      expect(emitted).toBeUndefined();
    });
  });

  describe("resetPasswordWithToken", () => {
    it("posts token+newPassword and completes with void", () => {
      let emitted: unknown = "NOT_CALLED";
      service
        .resetPasswordWithToken("reset-tok", "newpass123")
        .subscribe((v) => (emitted = v));
      const req = httpMock.expectOne("/api/auth/reset-password");
      expect(req.request.body).toEqual({
        token: "reset-tok",
        newPassword: "newpass123",
      });
      req.flush(null);
      expect(emitted).toBeUndefined();
    });
  });
});
