import mongoose, { Schema, Document, Model } from 'mongoose';
import { GAME_VERSIONS, CATEGORIES, RESEARCH_TIERS, ROOM_TYPE_IDS } from '../../../lib/index';

export interface Blueprint extends Document {
  owner: string;
  name: string;
  // Star-rating aggregate, denormalized from the blueprintratings collection
  // by BlueprintController.recomputeRatingAggregate — never computed at read
  // time. (Replaced the retired likes/likeCount fields; orphaned like data
  // may linger on old documents until a cleanup migration drops it.)
  ratingCount?: number;
  ratingAverage?: number;
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
  // Room types detected in the blueprint content, server-derived on every save
  // (never client-supplied). null/absent = never derived or blueprint too large
  // for detection; [] = derived, no rooms found.
  rooms?: string[] | null;
  currentVersionId?: mongoose.Types.ObjectId | null;
  forkedFrom?: {
    blueprintId: mongoose.Types.ObjectId;
    versionId: mongoose.Types.ObjectId;
    forkedAt: Date;
  } | null;
  forkCount?: number;
  // Approximate engagement counters — incremented in batches by
  // BlueprintCounterService, not per request
  viewCount?: number;
  downloadCount?: number;
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
      ratingCount: { type: Number, default: 0 },
      ratingAverage: { type: Number, default: 0 },
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
      // No default: absent means "never derived", distinct from [] = "derived,
      // none found" (mirrors the gameVersion nullability convention).
      rooms: { type: [String], enum: ROOM_TYPE_IDS, default: undefined },
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
      viewCount: { type: Number, default: 0 },
      downloadCount: { type: Number, default: 0 },
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
    // Room-type filter on the public feed (multikey on rooms)
    blueprintSchema.index({ deletedAt: 1, isPublished: 1, rooms: 1, createdAt: -1 });
    // "Top rated" sort on the public feed
    blueprintSchema.index({
      deletedAt: 1,
      isPublished: 1,
      ratingAverage: -1,
      ratingCount: -1,
      createdAt: -1,
    });
    // "Most forked" sort
    blueprintSchema.index({ deletedAt: 1, isPublished: 1, forkCount: -1, createdAt: -1 });
    // "Most viewed" / "Most downloaded" sorts
    blueprintSchema.index({ deletedAt: 1, isPublished: 1, viewCount: -1, createdAt: -1 });
    blueprintSchema.index({ deletedAt: 1, isPublished: 1, downloadCount: -1, createdAt: -1 });

    BlueprintModel.model = mongoose.model<Blueprint>('Blueprint', blueprintSchema);
  }
}
