import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable } from "rxjs";
import {
  ListCommentsResponse,
  PostCommentResponse,
} from "../../../../../lib/index";
import { AuthenticationService } from "./authentification-service";

@Injectable()
export class CommentService {
  constructor(
    private http: HttpClient,
    private auth: AuthenticationService,
  ) {}

  // Token is optional on the list call: the backend uses it to compute
  // per-comment delete rights for the viewer
  public getComments(blueprintId: string): Observable<ListCommentsResponse> {
    return this.http.get<ListCommentsResponse>(
      `/api/blueprints/${blueprintId}/comments`,
      this.auth.isLoggedIn() ? { headers: this.authHeaders() } : {},
    );
  }

  public postComment(
    blueprintId: string,
    body: string,
    parentId?: string,
  ): Observable<PostCommentResponse> {
    return this.http.post<PostCommentResponse>(
      `/api/blueprints/${blueprintId}/comments`,
      parentId != null ? { body, parentId } : { body },
      { headers: this.authHeaders() },
    );
  }

  public editComment(
    commentId: string,
    body: string,
  ): Observable<PostCommentResponse> {
    return this.http.patch<PostCommentResponse>(
      `/api/comments/${commentId}`,
      { body },
      { headers: this.authHeaders() },
    );
  }

  public deleteComment(commentId: string): Observable<{ delete: string }> {
    return this.http.delete<{ delete: string }>(`/api/comments/${commentId}`, {
      headers: this.authHeaders(),
    });
  }

  private authHeaders() {
    return { Authorization: `Bearer ${this.auth.getToken()}` };
  }
}
