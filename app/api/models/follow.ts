import mongoose, { Schema, Document, Model } from 'mongoose';

export interface Follow extends Document {
  followerId: mongoose.Types.ObjectId;
  followeeId: mongoose.Types.ObjectId;
  createdAt: Date;
}

export class FollowModel {
  static model: Model<Follow>;

  public static init() {
    const followSchema = new mongoose.Schema({
      followerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      followeeId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      createdAt: { type: Date, default: Date.now },
    });

    // Prevents duplicate follows; also the natural lookup for "does A follow B"
    followSchema.index({ followerId: 1, followeeId: 1 }, { unique: true });
    // Follower count / "who follows X"
    followSchema.index({ followeeId: 1 });
    // My followees, newest first — feed source
    followSchema.index({ followerId: 1, createdAt: -1 });

    FollowModel.model = (mongoose.models['Follow'] as Model<Follow>) ?? mongoose.model<Follow>('Follow', followSchema);
  }
}
