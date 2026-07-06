import mongoose, { Schema, Document, Model } from 'mongoose';

export interface Comment extends Document {
  blueprintId: mongoose.Types.ObjectId;
  authorId: mongoose.Types.ObjectId;
  // null = top-level; must reference a top-level comment (no grandchildren)
  parentId: mongoose.Types.ObjectId | null;
  // Sanitized plain text with internal reference tokens — never raw user input
  body: string;
  createdAt: Date;
  // Bumped on each reply; equals createdAt while a comment has no replies
  lastActivityAt: Date;
  deletedAt?: Date | null;
}

export class CommentModel {
  static model: Model<Comment>;

  public static init() {
    const commentSchema = new mongoose.Schema({
      blueprintId: { type: Schema.Types.ObjectId, ref: 'Blueprint', required: true },
      authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      parentId: { type: Schema.Types.ObjectId, ref: 'Comment', default: null },
      body: { type: String, required: true, maxlength: 2000 },
      createdAt: { type: Date, default: Date.now },
      lastActivityAt: { type: Date, default: Date.now },
      deletedAt: { type: Date, default: null },
    });

    // Primary feed: top-level comments by most recent activity
    commentSchema.index({ blueprintId: 1, parentId: 1, lastActivityAt: -1 });
    // Reply thread read order
    commentSchema.index({ blueprintId: 1, parentId: 1, createdAt: 1 });
    // Profile activity + posting-cooldown lookup
    commentSchema.index({ authorId: 1, createdAt: -1 });

    CommentModel.model =
      (mongoose.models['Comment'] as Model<Comment>) ?? mongoose.model<Comment>('Comment', commentSchema);
  }
}
