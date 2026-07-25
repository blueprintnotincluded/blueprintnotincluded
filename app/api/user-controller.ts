import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { UserModel, UserJwt } from './models/user';
import { FollowModel } from './models/follow';
import { BlueprintModel } from './models/blueprint';
import { BlueprintController, PUBLISHED_FILTER } from './blueprint-controller';
import {
  ProfileResponse,
  FollowRequest,
  UpdateBioRequest,
  FollowListResponse,
  UpdateDlcPreferencesRequest,
  DLC_ID_PATTERN,
  MAX_DLC_FILTER_IDS,
} from '../../lib/index';
import { NotificationController } from './notification-controller';
import { apiError } from './utils/apiError';
import { parseOlderThan } from './utils/pagination';
import { optionalViewer } from './utils/optionalViewer';

// Caps the $in list on the feed's blueprint query so an account following an
// unusually large number of users can't force an unbounded lookup
const MAX_FEED_FOLLOWEES = 500;

export class UserController {
  constructor() {
    this.getProfile = this.getProfile.bind(this);
    this.follow = this.follow.bind(this);
    this.updateBio = this.updateBio.bind(this);
    this.getDlcPreferences = this.getDlcPreferences.bind(this);
    this.updateDlcPreferences = this.updateDlcPreferences.bind(this);
    this.getFeed = this.getFeed.bind(this);
    this.getFollowers = this.getFollowers.bind(this);
    this.getFollowing = this.getFollowing.bind(this);
  }

  public getProfile(req: Request, res: Response): void {
    const username = req.params.username;
    const userJwt = req.user as UserJwt | undefined;

    UserModel.model
      .findOne({ username })
      .then(async targetUser => {
        if (!targetUser) {
          res.status(404).json(apiError(404, 'User not found'));
          return;
        }

        const targetId = targetUser._id;
        const [blueprintCount, followerCount, followingCount, followedByMe] = await Promise.all([
          BlueprintModel.model.countDocuments({ owner: targetId, deletedAt: null }),
          FollowModel.model.countDocuments({ followeeId: targetId }),
          FollowModel.model.countDocuments({ followerId: targetId }),
          userJwt != null
            ? FollowModel.model
                .exists({ followerId: userJwt._id, followeeId: targetId })
                .then(result => result != null)
            : Promise.resolve(false),
        ]);

        const response: ProfileResponse = {
          id: (targetId as mongoose.Types.ObjectId).toString(),
          username: targetUser.username as string,
          bio: targetUser.bio ?? '',
          memberSince: (targetId as mongoose.Types.ObjectId).getTimestamp().toISOString(),
          blueprintCount,
          followerCount,
          followingCount,
          followedByMe,
          avatarId: targetUser.avatarId ? targetUser.avatarId.toString() : null,
        };
        res.json(response);
      })
      .catch(err => {
        console.log('getProfile error');
        console.log(err);
        res.status(500).json(apiError(500, 'Failed to retrieve profile'));
      });
  }

  public follow(req: Request, res: Response): void {
    const user = req.user as UserJwt;
    const { followeeId, follow } = req.body as FollowRequest;

    if (
      followeeId == null ||
      typeof followeeId !== 'string' ||
      !mongoose.Types.ObjectId.isValid(followeeId) ||
      typeof follow !== 'boolean'
    ) {
      res.status(400).json(apiError(400, 'Missing or invalid followeeId or follow'));
      return;
    }

    if (followeeId === user._id) {
      res.status(400).json(apiError(400, 'Cannot follow yourself'));
      return;
    }

    UserModel.model
      .exists({ _id: followeeId })
      .then(exists => {
        if (!exists) {
          res.status(404).json(apiError(404, 'User not found'));
          return;
        }

        if (follow) {
          FollowModel.model
            .create({ followerId: user._id, followeeId })
            .then(async () => {
              await NotificationController.notify({
                recipientId: followeeId,
                actorId: user._id,
                type: 'follow',
              });
              res.json({ follow: 'OK' });
            })
            .catch(err => {
              // Duplicate-key on the unique pair index just means "already following" — idempotent success
              if (err?.code === 11000) {
                res.json({ follow: 'OK' });
                return;
              }
              console.log('follow error');
              console.log(err);
              res.status(500).json(apiError(500, 'Failed to follow user'));
            });
        } else {
          FollowModel.model
            .deleteOne({ followerId: user._id, followeeId })
            .then(() => res.json({ follow: 'OK' }))
            .catch(err => {
              console.log('unfollow error');
              console.log(err);
              res.status(500).json(apiError(500, 'Failed to unfollow user'));
            });
        }
      })
      .catch(err => {
        console.log('follow lookup error');
        console.log(err);
        res.status(500).json(apiError(500, 'Failed to process follow request'));
      });
  }

  public updateBio(req: Request, res: Response): void {
    const user = req.user as UserJwt;
    const { bio } = req.body as UpdateBioRequest;

    if (typeof bio !== 'string' || bio.length > 500) {
      res.status(400).json(apiError(400, 'bio must be a string of 500 characters or fewer'));
      return;
    }

    UserModel.model
      .findByIdAndUpdate(user._id, { bio }, { new: true })
      .then(updated => {
        if (!updated) {
          res.status(404).json(apiError(404, 'User not found'));
          return;
        }
        res.json({ bio: updated.bio ?? '' });
      })
      .catch(err => {
        console.log('updateBio error');
        console.log(err);
        res.status(500).json(apiError(500, 'Failed to update bio'));
      });
  }

  // Private account state — never merge this into getProfile/ProfileResponse,
  // which is reachable by other users.
  public getDlcPreferences(req: Request, res: Response): void {
    const user = req.user as UserJwt;

    UserModel.model
      .findById(user._id)
      .select('dlcPreferences')
      .lean()
      .then(found => {
        if (!found) {
          res.status(404).json(apiError(404, 'User not found'));
          return;
        }
        res.json({ excludedDlcs: found.dlcPreferences?.excludedDlcs ?? [] });
      })
      .catch(err => {
        console.log('getDlcPreferences error');
        console.log(err);
        res.status(500).json(apiError(500, 'Failed to retrieve DLC preferences'));
      });
  }

  public updateDlcPreferences(req: Request, res: Response): void {
    const user = req.user as UserJwt;
    const { excludedDlcs } = req.body as UpdateDlcPreferencesRequest;

    if (!Array.isArray(excludedDlcs) || excludedDlcs.length > MAX_DLC_FILTER_IDS) {
      res
        .status(400)
        .json(apiError(400, `excludedDlcs must be an array of up to ${MAX_DLC_FILTER_IDS} DLC ids`));
      return;
    }
    if (excludedDlcs.some(id => typeof id !== 'string' || !DLC_ID_PATTERN.test(id))) {
      res
        .status(400)
        .json(apiError(400, 'excludedDlcs must contain only valid DLC ids (A-Z, 0-9 and _)'));
      return;
    }

    UserModel.model
      .findByIdAndUpdate(user._id, { 'dlcPreferences.excludedDlcs': excludedDlcs }, { new: true })
      .then(updated => {
        if (!updated) {
          res.status(404).json(apiError(404, 'User not found'));
          return;
        }
        res.json({ excludedDlcs: updated.dlcPreferences?.excludedDlcs ?? [] });
      })
      .catch(err => {
        console.log('updateDlcPreferences error');
        console.log(err);
        res.status(500).json(apiError(500, 'Failed to update DLC preferences'));
      });
  }

  public getFeed(req: Request, res: Response): void {
    const user = req.user as UserJwt;

    const dateFilter = parseOlderThan(req, res);
    if (dateFilter == null) return;

    FollowModel.model
      .find({ followerId: user._id })
      .select('followeeId')
      .sort({ createdAt: -1 })
      .limit(MAX_FEED_FOLLOWEES)
      .lean()
      .then(follows => {
        const followeeIds = follows.map(f => f.followeeId);

        if (followeeIds.length === 0) {
          res.json({ blueprints: [], oldest: new Date(), remaining: 0 });
          return;
        }

        const browseIncrement = parseInt(process.env.BROWSE_INCREMENT as string);
        BlueprintModel.model
          .find({
            owner: { $in: followeeIds },
            deletedAt: null,
            // Followees' drafts are private — following someone must not
            // reveal their unpublished work
            isPublished: PUBLISHED_FILTER,
            createdAt: { $lt: dateFilter },
          })
          .sort({ createdAt: -1 })
          .limit(browseIncrement * 2)
          .select('-data -thumbnail')
          .populate('owner')
          .then(blueprints => {
            return BlueprintController.handleGetBlueprint(req, res, blueprints);
          })
          .catch(err => {
            console.log('getFeed blueprint find error');
            console.log(err);
            res.status(500).json(apiError(500, 'Failed to retrieve feed'));
          });
      })
      .catch(err => {
        console.log('getFeed follow lookup error');
        console.log(err);
        res.status(500).json(apiError(500, 'Failed to retrieve feed'));
      });
  }

  public getFollowers(req: Request, res: Response): void {
    this.getConnections(req, res, 'followers').catch(err => {
      console.log('getFollowers error');
      console.log(err);
      res.status(500).json(apiError(500, 'Failed to retrieve followers'));
    });
  }

  public getFollowing(req: Request, res: Response): void {
    this.getConnections(req, res, 'following').catch(err => {
      console.log('getFollowing error');
      console.log(err);
      res.status(500).json(apiError(500, 'Failed to retrieve following'));
    });
  }

  // Shared implementation for the followers/following lists: same shape, only the
  // side of the Follow relation being matched/populated differs.
  private async getConnections(req: Request, res: Response, mode: 'followers' | 'following'): Promise<void> {
    const username = req.params.username;
    const viewer = optionalViewer(req);

    const dateFilter = parseOlderThan(req, res);
    if (dateFilter == null) return;

    const targetUser = await UserModel.model.findOne({ username });
    if (!targetUser) {
      res.status(404).json(apiError(404, 'User not found'));
      return;
    }

    const matchField = mode === 'followers' ? 'followeeId' : 'followerId';
    const populateField = mode === 'followers' ? 'followerId' : 'followeeId';

    const browseIncrement = parseInt(process.env.BROWSE_INCREMENT as string);
    const rows = await FollowModel.model
      .find({ [matchField]: targetUser._id, createdAt: { $lt: dateFilter } })
      .sort({ createdAt: -1 })
      .limit(browseIncrement * 2)
      .populate(populateField, 'username')
      .lean();

    const response: FollowListResponse = { users: [], oldest: new Date().toISOString(), remaining: 0 };

    if (rows.length > 0) {
      response.remaining = Math.max(0, rows.length - browseIncrement);
      const page = rows.slice(0, Math.min(browseIncrement, rows.length));

      let oldest = new Date();
      const rowUserIds: mongoose.Types.ObjectId[] = [];
      for (const row of page) {
        const createdAt = row.createdAt as Date;
        if (createdAt < oldest) oldest = createdAt;
        const populated = row[populateField] as unknown as { _id: mongoose.Types.ObjectId; username: string } | null;
        if (populated != null) rowUserIds.push(populated._id);
      }
      response.oldest = oldest.toISOString();

      let followedByMeIds = new Set<string>();
      if (viewer != null && rowUserIds.length > 0) {
        const myFollows = await FollowModel.model
          .find({ followerId: viewer._id, followeeId: { $in: rowUserIds } })
          .select('followeeId')
          .lean();
        followedByMeIds = new Set(myFollows.map(f => (f.followeeId as mongoose.Types.ObjectId).toString()));
      }

      for (const row of page) {
        const populated = row[populateField] as unknown as { _id: mongoose.Types.ObjectId; username: string } | null;
        if (populated == null) continue; // referenced user was deleted
        response.users.push({
          id: populated._id.toString(),
          username: populated.username,
          followedByMe: followedByMeIds.has(populated._id.toString()),
        });
      }
    }

    res.json(response);
  }
}
