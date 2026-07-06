export type CommentSegmentType = 'text' | 'blueprint' | 'user';
export interface CommentSegment {
    type: CommentSegmentType;
    text?: string;
    id?: string;
    name?: string | null;
}
export interface CommentDto {
    id: string;
    parentId: string | null;
    author: {
        id: string;
        username: string;
    } | null;
    segments: CommentSegment[];
    deleted: boolean;
    createdAt: string;
    lastActivityAt: string;
    canDelete: boolean;
}
export interface CommentThread {
    comment: CommentDto;
    replies: CommentDto[];
}
export interface ListCommentsResponse {
    threads: CommentThread[];
    total: number;
}
export interface PostCommentRequest {
    body: string;
    parentId?: string | null;
}
export interface PostCommentResponse {
    comment: CommentDto;
}
export declare const COMMENT_MAX_LENGTH = 2000;
//# sourceMappingURL=comments.d.ts.map