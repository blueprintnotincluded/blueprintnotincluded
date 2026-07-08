import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { NotificationModel, NotificationType } from './models/notification';
import { UserJwt } from './models/user';
import { BlueprintController } from './blueprint-controller';
import { NotificationListResponse } from '../../lib/index';
import { apiError } from './utils/apiError';
import { parseOlderThan } from './utils/pagination';

export interface NotifyParams {
  recipientId: mongoose.Types.ObjectId | string;
  actorId: mongoose.Types.ObjectId | string;
  type: NotificationType;
  blueprintId?: mongoose.Types.ObjectId | string | null;
  commentId?: mongoose.Types.ObjectId | string | null;
}

export class NotificationController {
  constructor() {
    this.list = this.list.bind(this);
    this.markAllRead = this.markAllRead.bind(this);
  }

  // Fire-and-forget: called from other controllers after their primary action
  // succeeds. Never let a notification failure fail the caller's request.
  public static async notify(params: NotifyParams): Promise<void> {
    if (params.recipientId.toString() === params.actorId.toString()) return;
    try {
      await NotificationModel.model.create({
        recipientId: params.recipientId,
        actorId: params.actorId,
        type: params.type,
        blueprintId: params.blueprintId ?? null,
        commentId: params.commentId ?? null,
      });
    } catch (err) {
      console.log('notification create error');
      console.log(err);
    }
  }

  public async list(req: Request, res: Response): Promise<void> {
    const user = req.user as UserJwt;

    const dateFilter = parseOlderThan(req, res);
    if (dateFilter == null) return;

    try {
      const browseIncrement = parseInt(process.env.BROWSE_INCREMENT as string);
      const [rows, unreadCount] = await Promise.all([
        NotificationModel.model
          .find({ recipientId: user._id, createdAt: { $lt: dateFilter } })
          .sort({ createdAt: -1 })
          .limit(browseIncrement * 2)
          .populate('actorId', 'username')
          .lean(),
        NotificationModel.model.countDocuments({ recipientId: user._id, read: false }),
      ]);

      const response: NotificationListResponse = {
        notifications: [],
        unreadCount,
        oldest: new Date().toISOString(),
        remaining: 0,
      };

      if (rows.length > 0) {
        response.remaining = Math.max(0, rows.length - browseIncrement);
        const page = rows.slice(0, Math.min(browseIncrement, rows.length));

        let oldest = new Date();
        const blueprintIds: mongoose.Types.ObjectId[] = [];
        for (const row of page) {
          const createdAt = row.createdAt as Date;
          if (createdAt < oldest) oldest = createdAt;
          if (row.blueprintId != null) blueprintIds.push(row.blueprintId as mongoose.Types.ObjectId);
        }
        response.oldest = oldest.toISOString();

        let blueprintNames = new Map<string, string | null>();
        try {
          blueprintNames = await BlueprintController.getForkedFromNames(blueprintIds);
        } catch (err) {
          // Decoration on the list — never fail it for this
          console.log('notification blueprint name lookup error');
          console.log(err);
        }

        for (const row of page) {
          const actor = row.actorId as unknown as { _id: mongoose.Types.ObjectId; username: string } | null;
          if (actor == null) continue; // actor account deleted

          const blueprintId = row.blueprintId != null ? (row.blueprintId as mongoose.Types.ObjectId).toString() : null;
          response.notifications.push({
            id: (row._id as mongoose.Types.ObjectId).toString(),
            type: row.type as NotificationType,
            actorUsername: actor.username,
            blueprintId,
            blueprintName: blueprintId != null ? blueprintNames.get(blueprintId) ?? null : null,
            commentId: row.commentId != null ? (row.commentId as mongoose.Types.ObjectId).toString() : null,
            createdAt: (row.createdAt as Date).toISOString(),
            read: row.read as boolean,
          });
        }
      }

      res.json(response);
    } catch (err) {
      console.log('notification list error');
      console.log(err);
      res.status(500).json(apiError(500, 'Failed to retrieve notifications'));
    }
  }

  public async markAllRead(req: Request, res: Response): Promise<void> {
    const user = req.user as UserJwt;
    try {
      await NotificationModel.model.updateMany({ recipientId: user._id, read: false }, { read: true });
      res.json({ markRead: 'OK' });
    } catch (err) {
      console.log('markAllRead error');
      console.log(err);
      res.status(500).json(apiError(500, 'Failed to mark notifications read'));
    }
  }
}
