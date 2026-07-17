export interface ProfileResponse {
  id: string;
  username: string;
  bio: string;
  memberSince: string;
  blueprintCount: number;
  followerCount: number;
  followingCount: number;
  followedByMe: boolean;
}

export interface FollowRequest {
  followeeId: string;
  follow: boolean;
}

export interface UpdateBioRequest {
  bio: string;
}

export interface FollowListEntry {
  id: string;
  username: string;
  followedByMe: boolean;
}

export interface FollowListResponse {
  users: FollowListEntry[];
  oldest: string;
  remaining: number;
}

// 'like' is retired (ratings replaced likes) but stays so historical
// notifications keep rendering
export type NotificationType = 'comment' | 'reply' | 'like' | 'rating' | 'fork' | 'follow';

export interface NotificationDto {
  id: string;
  type: NotificationType;
  actorUsername: string;
  blueprintId?: string | null;
  blueprintName?: string | null;
  commentId?: string | null;
  createdAt: string;
  read: boolean;
}

export interface NotificationListResponse {
  notifications: NotificationDto[];
  unreadCount: number;
  oldest: string;
  remaining: number;
}
