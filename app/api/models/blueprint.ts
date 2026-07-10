import mongoose, { Schema, Document, Model } from 'mongoose';
import { GAME_VERSIONS, CATEGORIES, RESEARCH_TIERS } from '../../../lib/index';

export interface Blueprint extends Document {
  owner: string;
  name: string;
  likes: string[];
  // optional: documents predating the backfill migration lack this field —
  // callers must fall back to likes?.length (see blueprint-controller)
  likeCount?: number;
  createdAt: Date;
  modifiedAt: Date;
  thumbnail: string;
  isCopy?: boolean;
  copyOf?: string;
  data: any;
  deletedAt?: Date | null;
  // Draft state: false = draft (owner/admin only). Docs predating the backfill
  // migration lack the field — doc-level checks must treat missing as published
  // (isPublished !== false); feed queries match { isPublished: { $ne: false } }
  // so those documents stay visible until the migration runs.
  isPublished?: boolean;
  gameVersion?: string | null;
  category?: string | null;
  subcategory?: string | null;
  description?: string | null;
  researchTier?: string | null;
  modded?: boolean | null;
  currentVersionId?: mongoose.Types.ObjectId | null;
  forkedFrom?: {
    blueprintId: mongoose.Types.ObjectId;
    versionId: mongoose.Types.ObjectId;
    forkedAt: Date;
  } | null;
  forkCount?: number;
}

export class BlueprintModel {
  static model: Model<Blueprint>;
  public static init() {
    let blueprintSchema = new mongoose.Schema({
      owner: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
      name: {
        type: String,
        required: true,
        match: [/^[a-zA-Z0-9_ -]+$/, 'Blueprint name may only contain letters, numbers, hyphens, underscores, and spaces'],
        maxlength: [60, 'Blueprint name must be 60 characters or fewer'],
        minlength: [1, 'Blueprint name is required'],
      },
      likes: { type: [String] },
      likeCount: { type: Number, default: 0 },
      createdAt: Date,
      modifiedAt: Date,
      thumbnail: String,
      isCopy: Boolean,
      copyOf: {
        type: Schema.Types.ObjectId,
        ref: 'Blueprint',
      },
      data: Object,
      deletedAt: { type: Date, default: null },
      // No schema default on purpose: mongoose applies defaults on query
      // hydration too, so `default: false` would make every pre-migration doc
      // read as a draft in the deploy→migrate window (migrations run
      // post-deploy here). Creation sites set false explicitly instead.
      isPublished: Boolean,
      gameVersion: { type: String, enum: [...GAME_VERSIONS, null], index: true },
      category: { type: String, enum: [...CATEGORIES, null], index: true },
      subcategory: { type: String, maxlength: 40 },
      description: { type: String, maxlength: 500 },
      researchTier: { type: String, enum: [...RESEARCH_TIERS, null] },
      modded: { type: Boolean },
      currentVersionId: {
        type: Schema.Types.ObjectId,
        ref: 'BlueprintVersion',
        default: null,
      },
      forkedFrom: {
        type: new Schema(
          {
            blueprintId: { type: Schema.Types.ObjectId, ref: 'Blueprint', required: true },
            versionId: { type: Schema.Types.ObjectId, ref: 'BlueprintVersion', required: true },
            forkedAt: { type: Date, required: true },
          },
          { _id: false }
        ),
        default: null,
      },
      forkCount: { type: Number, default: 0 },
    });

    // Listing query: filter by createdAt range, sort by createdAt desc
    blueprintSchema.index({ createdAt: -1 });
    // Listing query with owner filter
    blueprintSchema.index({ owner: 1, createdAt: -1 });
    // Upload duplicate-name check: find({ owner, name })
    blueprintSchema.index({ owner: 1, name: 1 });

    // Discovery feed indexes (deletedAt: null AND isPublished: true = public)
    blueprintSchema.index({ deletedAt: 1, isPublished: 1, createdAt: -1 });
    blueprintSchema.index({ deletedAt: 1, isPublished: 1, gameVersion: 1, createdAt: -1 });
    blueprintSchema.index({ deletedAt: 1, isPublished: 1, category: 1, createdAt: -1 });
    blueprintSchema.index({ deletedAt: 1, isPublished: 1, gameVersion: 1, category: 1, createdAt: -1 });
    // "Most liked" sort on the public feed
    blueprintSchema.index({ deletedAt: 1, isPublished: 1, likeCount: -1, createdAt: -1 });
    // "Most forked" sort
    blueprintSchema.index({ deletedAt: 1, isPublished: 1, forkCount: -1, createdAt: -1 });

    BlueprintModel.model = mongoose.model<Blueprint>('Blueprint', blueprintSchema);
  }
}
