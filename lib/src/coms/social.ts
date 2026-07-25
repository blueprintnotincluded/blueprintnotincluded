export interface ProfileResponse {
  id: string;
  username: string;
  bio: string;
  memberSince: string;
  blueprintCount: number;
  followerCount: number;
  followingCount: number;
  followedByMe: boolean;
  // Current avatar id, or null for the letter-circle fallback. Image at
  // /api/avatars/:id/image (immutable per id).
  avatarId?: string | null;
}

export interface FollowRequest {
  followeeId: string;
  follow: boolean;
}

export interface UpdateBioRequest {
  bio: string;
}

// Private account data — which DLC packs the user doesn't want to see in
// Discover. Never part of ProfileResponse; only reachable by the owner via
// /api/users/me/dlc-preferences.
export interface DlcPreferencesResponse {
  excludedDlcs: string[];
}

export interface UpdateDlcPreferencesRequest {
  excludedDlcs: string[];
}

export interface FollowListEntry {
  id: string;
  username: string;
  followedByMe: boolean;
}

// ─── Avatars ────────────────────────────────────────────────────────────────

export interface AvatarCandidate {
  id: string;
  url: string;
}

export interface AvatarGenerateResponse {
  avatarId: string | null;
  url: string;
  candidates: AvatarCandidate[];
  sourceType: string | null;
  faceLikely: boolean | null;
}

export interface AvatarStatusResponse {
  avatarId: string | null;
  // ISO timestamp when the next generation is allowed; null = allowed now
  nextGenerateAt: string | null;
  poolCount: number;
}

export interface AvailableAvatarsResponse {
  avatars: AvatarCandidate[];
  total: number;
}

export interface AvatarSelectRequest {
  avatarId: string;
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
