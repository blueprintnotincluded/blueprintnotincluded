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
