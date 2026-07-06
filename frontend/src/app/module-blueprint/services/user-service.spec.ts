import { UserService } from "./user-service";
import { HttpParams } from "@angular/common/http";
import { of } from "rxjs";

describe("UserService", () => {
  let service: UserService;
  let mockHttp: any;
  let mockAuth: any;

  beforeEach(() => {
    mockHttp = {
      get: vi.fn(() => of({})),
      post: vi.fn(() => of({})),
      patch: vi.fn(() => of({})),
    };
    mockAuth = {
      isLoggedIn: vi.fn(() => false),
      getToken: vi.fn(() => "token123"),
    };
    service = new UserService(mockHttp, mockAuth);
  });

  describe("getProfile", () => {
    it("hits the anonymous endpoint when logged out", () => {
      service.getProfile("alice").subscribe();
      expect(mockHttp.get).toHaveBeenCalledWith(
        "/api/users/alice/profile",
        expect.objectContaining({ headers: {} })
      );
    });

    it("hits the secure endpoint with an auth header when logged in", () => {
      mockAuth.isLoggedIn.mockReturnValue(true);
      service.getProfile("alice").subscribe();
      expect(mockHttp.get).toHaveBeenCalledWith(
        "/api/users/alice/profileSecure",
        expect.objectContaining({
          headers: { Authorization: "Bearer token123" },
        })
      );
    });
  });

  describe("follow", () => {
    it("posts followeeId and the desired follow state", () => {
      mockAuth.isLoggedIn.mockReturnValue(true);
      service.follow("user-1", true).subscribe();
      expect(mockHttp.post).toHaveBeenCalledWith(
        "/api/follow",
        { followeeId: "user-1", follow: true },
        expect.objectContaining({
          headers: { Authorization: "Bearer token123" },
        })
      );
    });

    it("errors without hitting the network when logged out", () => {
      const onError = vi.fn();
      service.follow("user-1", true).subscribe({ error: onError });
      expect(onError).toHaveBeenCalled();
      expect(mockHttp.post).not.toHaveBeenCalled();
    });
  });

  describe("updateBio", () => {
    it("patches the bio", () => {
      mockAuth.isLoggedIn.mockReturnValue(true);
      service.updateBio("hello").subscribe();
      expect(mockHttp.patch).toHaveBeenCalledWith(
        "/api/users/me",
        { bio: "hello" },
        expect.objectContaining({
          headers: { Authorization: "Bearer token123" },
        })
      );
    });

    it("errors without hitting the network when logged out", () => {
      const onError = vi.fn();
      service.updateBio("hello").subscribe({ error: onError });
      expect(onError).toHaveBeenCalled();
      expect(mockHttp.patch).not.toHaveBeenCalled();
    });
  });

  describe("getFeed", () => {
    it("requests the feed with an olderthan cursor", () => {
      const date = new Date("2024-01-01");
      service.getFeed(date).subscribe();
      expect(mockHttp.get).toHaveBeenCalledWith(
        "/api/feed",
        expect.objectContaining({
          params: new HttpParams().set("olderthan", date.getTime().toString()),
          headers: { Authorization: "Bearer token123" },
        })
      );
    });
  });
});
