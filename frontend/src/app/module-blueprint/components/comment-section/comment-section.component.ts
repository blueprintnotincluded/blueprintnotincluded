import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
} from "@angular/core";
import {
  CommentDto,
  CommentThread,
  COMMENT_MAX_LENGTH,
} from "../../../../../../lib/index";
import { CommentService } from "../../services/comment.service";
import { AuthenticationService } from "../../services/authentification-service";
import { TranslationService } from "../../services/translation.service";

@Component({
  selector: "app-comment-section",
  templateUrl: "./comment-section.component.html",
  styleUrls: ["./comment-section.component.css"],
  standalone: false,
})
export class CommentSectionComponent implements OnChanges {
  @Input() blueprintId: string | null = null;
  @Output() commentsLoaded = new EventEmitter<void>();

  loading = false;
  loadError = false;
  threads: CommentThread[] = [];
  total = 0;

  newComment = "";
  replyingTo: string | null = null;
  replyText = "";
  editingId: string | null = null;
  editText = "";
  editOriginalText = "";
  posting = false;
  postError: string | null = null;

  readonly maxLength = COMMENT_MAX_LENGTH;

  // Per-comment translation state, keyed by comment id
  translatingIds = new Set<string>();
  showingTranslationIds = new Set<string>();
  translateAllWorking = false;

  constructor(
    private commentService: CommentService,
    public authService: AuthenticationService,
    public translationService: TranslationService,
  ) {}

  ngOnChanges() {
    this.newComment = "";
    this.replyingTo = null;
    this.replyText = "";
    this.editingId = null;
    this.editText = "";
    this.editOriginalText = "";
    this.postError = null;
    this.translatingIds = new Set();
    this.showingTranslationIds = new Set();
    this.translateAllWorking = false;
    this.reload();
  }

  // The button set only appears on content the viewer doesn't already read,
  // and only when logged in — the translate endpoint requires auth, so an
  // anonymous click would just fail. Nearly all traffic never sees it.
  isForeignLanguage(comment: CommentDto): boolean {
    return (
      this.authService.isLoggedIn() &&
      !comment.deleted &&
      comment.sourceLang != null &&
      !this.translationService.matchesViewerLang(comment.sourceLang)
    );
  }

  get foreignCommentIds(): string[] {
    const all = [
      ...this.threads.map((t) => t.comment),
      ...this.threads.flatMap((t) => t.replies),
    ];
    return all.filter((c) => this.isForeignLanguage(c)).map((c) => c.id);
  }

  get showTranslateAll(): boolean {
    return this.foreignCommentIds.length >= 2;
  }

  translatedSegments(comment: CommentDto) {
    return this.translationService.cachedComment(comment.id)?.segments ?? null;
  }

  translationDegraded(comment: CommentDto): boolean {
    return this.translationService.cachedComment(comment.id)?.degraded === true;
  }

  translateComment(comment: CommentDto) {
    if (this.blueprintId == null || this.translatingIds.has(comment.id)) return;
    if (this.translationService.cachedComment(comment.id) != null) {
      this.showingTranslationIds.add(comment.id);
      return;
    }
    this.translatingIds.add(comment.id);
    this.translationService
      .translateComments(this.blueprintId, [comment.id])
      .subscribe({
        next: () => {
          this.translatingIds.delete(comment.id);
          this.showingTranslationIds.add(comment.id);
        },
        error: () => {
          this.translatingIds.delete(comment.id);
        },
      });
  }

  showOriginalComment(comment: CommentDto) {
    this.showingTranslationIds.delete(comment.id);
  }

  translateAll() {
    if (this.blueprintId == null || this.translateAllWorking) return;
    const ids = this.foreignCommentIds;
    if (ids.length === 0) return;
    this.translateAllWorking = true;
    // Mirrors translatingIds so a per-comment "Translate" click on one of
    // these ids while the batch is in flight is disabled instead of firing a
    // duplicate request.
    for (const id of ids) this.translatingIds.add(id);
    this.translationService.translateComments(this.blueprintId, ids).subscribe({
      next: () => {
        this.translateAllWorking = false;
        for (const id of ids) {
          this.translatingIds.delete(id);
          this.showingTranslationIds.add(id);
        }
      },
      error: () => {
        this.translateAllWorking = false;
        for (const id of ids) this.translatingIds.delete(id);
      },
    });
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
        this.commentsLoaded.emit();
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
    this.editOriginalText = this.editText;
    this.cancelReply();
    this.postError = null;
  }

  cancelEdit() {
    this.editingId = null;
    this.editText = "";
    this.editOriginalText = "";
  }

  saveEdit() {
    if (
      this.editingId == null ||
      !this.editText.trim() ||
      this.posting ||
      this.editText === this.editOriginalText
    )
      return;
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
