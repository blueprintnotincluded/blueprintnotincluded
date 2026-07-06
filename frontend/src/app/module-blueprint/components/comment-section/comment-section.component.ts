import { Component, Input, OnChanges } from "@angular/core";
import {
  CommentDto,
  CommentThread,
  COMMENT_MAX_LENGTH,
} from "../../../../../../lib/index";
import { CommentService } from "../../services/comment.service";
import { AuthenticationService } from "../../services/authentification-service";

@Component({
  selector: "app-comment-section",
  templateUrl: "./comment-section.component.html",
  styleUrls: ["./comment-section.component.css"],
  standalone: false,
})
export class CommentSectionComponent implements OnChanges {
  @Input() blueprintId: string | null = null;

  loading = false;
  loadError = false;
  threads: CommentThread[] = [];
  total = 0;

  newComment = "";
  replyingTo: string | null = null;
  replyText = "";
  editingId: string | null = null;
  editText = "";
  posting = false;
  postError: string | null = null;

  readonly maxLength = COMMENT_MAX_LENGTH;

  constructor(
    private commentService: CommentService,
    public authService: AuthenticationService
  ) {}

  ngOnChanges() {
    this.newComment = "";
    this.replyingTo = null;
    this.replyText = "";
    this.editingId = null;
    this.editText = "";
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
    this.cancelEdit();
    this.postError = null;
  }

  cancelReply() {
    this.replyingTo = null;
    this.replyText = "";
  }

  startEdit(comment: CommentDto) {
    this.editingId = comment.id;
    this.editText = comment.editSource ?? "";
    this.cancelReply();
    this.postError = null;
  }

  cancelEdit() {
    this.editingId = null;
    this.editText = "";
  }

  saveEdit() {
    if (this.editingId == null || !this.editText.trim() || this.posting) return;
    this.posting = true;
    this.postError = null;
    this.commentService.editComment(this.editingId, this.editText).subscribe({
      next: () => {
        this.posting = false;
        this.cancelEdit();
        this.reload();
      },
      error: (err) => {
        this.posting = false;
        this.postError =
          err?.error?.errors?.[0]?.title ??
          $localize`Could not save your edit. Please try again.`;
      },
    });
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
}
