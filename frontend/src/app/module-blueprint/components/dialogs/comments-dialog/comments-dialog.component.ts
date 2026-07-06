import { Component } from "@angular/core";
import {
  CommentDto,
  CommentThread,
  COMMENT_MAX_LENGTH,
} from "../../../../../../../lib/index";
import { CommentService } from "../../../services/comment.service";
import { AuthenticationService } from "../../../services/authentification-service";
import { BlueprintService } from "../../../services/blueprint-service";

@Component({
  selector: "app-comments-dialog",
  templateUrl: "./comments-dialog.component.html",
  styleUrls: ["./comments-dialog.component.css"],
  standalone: false,
})
export class CommentsDialogComponent {
  visible = false;
  loading = false;
  loadError = false;
  threads: CommentThread[] = [];
  total = 0;

  newComment = "";
  replyingTo: string | null = null;
  replyText = "";
  posting = false;
  postError: string | null = null;

  readonly maxLength = COMMENT_MAX_LENGTH;

  private blueprintId: string | null = null;

  constructor(
    private commentService: CommentService,
    public authService: AuthenticationService,
    private blueprintService: BlueprintService
  ) {}

  public open() {
    this.blueprintId = this.blueprintService.id;
    if (this.blueprintId == null) return;
    this.visible = true;
    this.newComment = "";
    this.replyingTo = null;
    this.replyText = "";
    this.postError = null;
    this.reload();
  }

  private reload() {
    if (this.blueprintId == null) return;
    this.loading = true;
    this.loadError = false;
    this.commentService.getComments(this.blueprintId).subscribe({
      next: (response) => {
        this.threads = response.threads;
        this.total = response.total;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.loadError = true;
      },
    });
  }

  postTopLevel() {
    this.post(this.newComment);
  }

  startReply(comment: CommentDto) {
    this.replyingTo = comment.id;
    this.replyText = "";
    this.postError = null;
  }

  cancelReply() {
    this.replyingTo = null;
    this.replyText = "";
  }

  postReply() {
    if (this.replyingTo == null) return;
    this.post(this.replyText, this.replyingTo);
  }

  private post(body: string, parentId?: string) {
    if (this.blueprintId == null || !body.trim() || this.posting) return;
    this.posting = true;
    this.postError = null;
    this.commentService
      .postComment(this.blueprintId, body, parentId)
      .subscribe({
        next: () => {
          this.posting = false;
          this.newComment = "";
          this.cancelReply();
          this.reload();
        },
        error: (err) => {
          this.posting = false;
          this.postError =
            err?.error?.errors?.[0]?.title ??
            $localize`Could not post your comment. Please try again.`;
        },
      });
  }

  delete(comment: CommentDto) {
    this.commentService.deleteComment(comment.id).subscribe({
      next: () => this.reload(),
      error: () => this.reload(),
    });
  }

  onLinkClicked() {
    // Internal reference links navigate away; close so the dialog isn't
    // stranded over the newly loaded blueprint
    this.visible = false;
  }
}
