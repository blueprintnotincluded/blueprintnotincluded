import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { UserModel, UserJwt } from './models/user';
import { FollowModel } from './models/follow';
import { BlueprintModel } from './models/blueprint';
import { BlueprintController } from './blueprint-controller';
import { ProfileResponse, FollowRequest, UpdateBioRequest } from '../../lib/index';
import { apiError } from './utils/apiError';
import { parseOlderThan } from './utils/pagination';

export class UserController {
  constructor() {
    this.getProfile = this.getProfile.bind(this);
    this.follow = this.follow.bind(this);
    this.updateBio = this.updateBio.bind(this);
    this.getFeed = this.getFeed.bind(this);
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
            .then(() => res.json({ follow: 'OK' }))
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

  public getFeed(req: Request, res: Response): void {
    const user = req.user as UserJwt;

    const dateFilter = parseOlderThan(req, res);
    if (dateFilter == null) return;

    FollowModel.model
      .find({ followerId: user._id })
      .select('followeeId')
      .lean()
      .then(follows => {
        const followeeIds = follows.map(f => f.followeeId);

        if (followeeIds.length === 0) {
          res.json({ blueprints: [], oldest: new Date(), remaining: 0 });
          return;
        }

        const browseIncrement = parseInt(process.env.BROWSE_INCREMENT as string);
        BlueprintModel.model
          .find({ owner: { $in: followeeIds }, deletedAt: null, createdAt: { $lt: dateFilter } })
          .sort({ createdAt: -1 })
          .limit(browseIncrement * 2)
          .populate('owner')
          .then(blueprints => {
            BlueprintController.handleGetBlueprint(req, res, user._id, blueprints);
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
}
