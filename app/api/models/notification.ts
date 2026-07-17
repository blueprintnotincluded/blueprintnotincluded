import mongoose, { Schema, Document, Model } from 'mongoose';

// 'like' is retired (ratings replaced likes) but stays in the enum so
// historical notifications keep validating and rendering
export type NotificationType = 'comment' | 'reply' | 'like' | 'rating' | 'fork' | 'follow';

export interface Notification extends Document {
  recipientId: mongoose.Types.ObjectId;
  actorId: mongoose.Types.ObjectId;
  type: NotificationType;
  // Set for comment/reply/like/fork; null for follow
  blueprintId: mongoose.Types.ObjectId | null;
  // Set for comment/reply only
  commentId: mongoose.Types.ObjectId | null;
  read: boolean;
  createdAt: Date;
}

export class NotificationModel {
  static model: Model<Notification>;

  public static init() {
    const notificationSchema = new mongoose.Schema({
      recipientId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      type: { type: String, enum: ['comment', 'reply', 'like', 'rating', 'fork', 'follow'], required: true },
      blueprintId: { type: Schema.Types.ObjectId, ref: 'Blueprint', default: null },
      commentId: { type: Schema.Types.ObjectId, ref: 'Comment', default: null },
      read: { type: Boolean, default: false },
      createdAt: { type: Date, default: Date.now },
    });

    // List, newest first
    notificationSchema.index({ recipientId: 1, createdAt: -1 });
    // Unread count
    notificationSchema.index({ recipientId: 1, read: 1 });

    NotificationModel.model =
      (mongoose.models['Notification'] as Model<Notification>) ??
      mongoose.model<Notification>('Notification', notificationSchema);
  }
}
