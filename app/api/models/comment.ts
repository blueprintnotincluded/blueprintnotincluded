import mongoose, { Schema, Document, Model } from 'mongoose';

export interface Comment extends Document {
  blueprintId: mongoose.Types.ObjectId;
  authorId: mongoose.Types.ObjectId;
  // null = top-level; must reference a top-level comment (no grandchildren)
  parentId: mongoose.Types.ObjectId | null;
  // Sanitized plain text with internal reference tokens — never raw user input
  body: string;
  // ISO-639-1 language of `body`, server-derived on create/edit (never
  // client-supplied): null = detection ran and was not confident, absent =
  // never derived (legacy docs, until the derive-language backfill runs).
  sourceLang?: string | null;
  createdAt: Date;
  // Bumped on each reply; equals createdAt while a comment has no replies
  lastActivityAt: Date;
  // Set only when the author edits the body (drives the "(edited)" tag) —
  // never touched by replies or soft-deletes, unlike a generic updatedAt
  editedAt?: Date | null;
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
      // No default — same nullability convention as Blueprint.sourceLang
      sourceLang: { type: String, default: undefined },
      createdAt: { type: Date, default: Date.now },
      lastActivityAt: { type: Date, default: Date.now },
      editedAt: { type: Date, default: null },
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
