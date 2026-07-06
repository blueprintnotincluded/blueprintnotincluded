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
//# sourceMappingURL=social.d.ts.map