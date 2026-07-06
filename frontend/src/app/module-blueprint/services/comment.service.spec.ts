import { TestBed } from "@angular/core/testing";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import {
  provideHttpClient,
  withInterceptorsFromDi,
} from "@angular/common/http";

import { CommentService } from "./comment.service";
import { AuthenticationService } from "./authentification-service";

describe("CommentService", () => {
  let service: CommentService;
  let httpMock: HttpTestingController;
  let mockAuth: any;

  beforeEach(() => {
    mockAuth = {
      getToken: vi.fn().mockReturnValue("test-jwt"),
      isLoggedIn: vi.fn().mockReturnValue(true),
    };

    TestBed.configureTestingModule({
      providers: [
        CommentService,
        { provide: AuthenticationService, useValue: mockAuth },
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(CommentService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe("getComments", () => {
    it("fetches comments with the auth header when logged in", () => {
      let result: any;
      service.getComments("bp1").subscribe((r) => (result = r));

      const req = httpMock.expectOne("/api/blueprints/bp1/comments");
      expect(req.request.method).toBe("GET");
      expect(req.request.headers.get("Authorization")).toBe("Bearer test-jwt");

      req.flush({ threads: [], total: 0 });
      expect(result).toEqual({ threads: [], total: 0 });
    });

    it("omits the auth header when anonymous", () => {
      mockAuth.isLoggedIn.mockReturnValue(false);
      service.getComments("bp1").subscribe();

      const req = httpMock.expectOne("/api/blueprints/bp1/comments");
      expect(req.request.headers.has("Authorization")).toBe(false);
      req.flush({ threads: [], total: 0 });
    });
  });

  describe("postComment", () => {
    it("posts a top-level comment without parentId", () => {
      service.postComment("bp1", "hello").subscribe();

      const req = httpMock.expectOne("/api/blueprints/bp1/comments");
      expect(req.request.method).toBe("POST");
      expect(req.request.body).toEqual({ body: "hello" });
      expect(req.request.headers.get("Authorization")).toBe("Bearer test-jwt");
      req.flush({ comment: {} });
    });

    it("includes parentId for replies", () => {
      service.postComment("bp1", "a reply", "parent1").subscribe();

      const req = httpMock.expectOne("/api/blueprints/bp1/comments");
      expect(req.request.body).toEqual({
        body: "a reply",
        parentId: "parent1",
      });
      req.flush({ comment: {} });
    });
  });

  describe("deleteComment", () => {
    it("issues an authenticated DELETE", () => {
      service.deleteComment("c1").subscribe();

      const req = httpMock.expectOne("/api/comments/c1");
      expect(req.request.method).toBe("DELETE");
      expect(req.request.headers.get("Authorization")).toBe("Bearer test-jwt");
      req.flush({ delete: "OK" });
    });
  });
});
