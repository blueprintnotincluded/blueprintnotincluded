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
  // Only meaningful when the request carried a valid token
  canDelete: boolean;
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

export const COMMENT_MAX_LENGTH = 2000;
