// Comment system API shapes. Bodies are stored as sanitized plain text with
// internal reference tokens ({{blueprint:id}} / {{user:id}}); the API always
// returns pre-resolved segments so clients never parse tokens or render HTML.

export type CommentSegmentType = 'text' | 'blueprint' | 'user';

export interface CommentSegment {
  type: CommentSegmentType;
  // type 'text': the literal text to display (client must escape/interpolate)
  text?: string;
  // type 'blueprint' | 'user': internal entity reference
  id?: string;
  // Resolved display name (blueprint name or username); null when the target
  // no longer exists — render as "[deleted blueprint]" / "[deleted user]"
  name?: string | null;
}

export interface CommentDto {
  id: string;
  parentId: string | null;
  // null when the comment is soft-deleted (rendered as "[comment removed]")
  author: { id: string; username: string } | null;
  segments: CommentSegment[];
  deleted: boolean;
  createdAt: string;
  lastActivityAt: string;
  // Set when the author has edited the body at least once ("(edited)" tag,
  // hover shows this date). Distinct from any document-level updated
  // timestamp: replies and moderation never touch it.
  editedAt: string | null;
  // ISO-639-1 language of `body`, server-derived on post/edit; null =
  // detection ran and was not confident, absent = never derived (legacy docs).
  sourceLang?: string | null;
  // Only meaningful when the request carried a valid token
  canDelete: boolean;
  canEdit: boolean;
  // Present when canEdit: the stored body with reference tokens rendered
  // back to typeable forms (/b/<id>, @username) to prefill the edit box
  editSource?: string;
}

export interface CommentThread {
  comment: CommentDto;
  replies: CommentDto[];
}

export interface ListCommentsResponse {
  threads: CommentThread[];
  // Visible comments incl. replies (excludes hidden deleted ones)
  total: number;
}

export interface PostCommentRequest {
  body: string;
  // Omit or null for a top-level comment; must reference a top-level comment
  parentId?: string | null;
}

export interface PostCommentResponse {
  comment: CommentDto;
}

export interface EditCommentRequest {
  body: string;
}

export const COMMENT_MAX_LENGTH = 2000;
