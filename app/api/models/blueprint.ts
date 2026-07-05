import mongoose, { Schema, Document, Model } from 'mongoose';
import { GAME_VERSIONS, CATEGORIES, RESEARCH_TIERS } from '../../../lib/index';

export interface Blueprint extends Document {
  owner: string;
  name: string;
  tags: string[];
  likes: string[];
  likeCount: number;
  createdAt: Date;
  modifiedAt: Date;
  thumbnail: string;
  isCopy?: boolean;
  copyOf?: string;
  data: any;
  deletedAt?: Date | null;
  gameVersion?: string | null;
  category?: string | null;
  subcategory?: string | null;
  description?: string | null;
  researchTier?: string | null;
  modded?: boolean | null;
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
      tags: { type: [String] },
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
      gameVersion: { type: String, enum: [...GAME_VERSIONS, null], index: true },
      category: { type: String, enum: [...CATEGORIES, null], index: true },
      subcategory: { type: String, maxlength: 40 },
      description: { type: String, maxlength: 500 },
      researchTier: { type: String, enum: [...RESEARCH_TIERS, null] },
      modded: { type: Boolean },
    });

    // Listing query: filter by createdAt range, sort by createdAt desc
    blueprintSchema.index({ createdAt: -1 });
    // Listing query with owner filter
    blueprintSchema.index({ owner: 1, createdAt: -1 });
    // Upload duplicate-name check: find({ owner, name })
    blueprintSchema.index({ owner: 1, name: 1 });

    // Discovery feed indexes (deletedAt: null = public)
    blueprintSchema.index({ deletedAt: 1, createdAt: -1 });
    blueprintSchema.index({ deletedAt: 1, gameVersion: 1, createdAt: -1 });
    blueprintSchema.index({ deletedAt: 1, category: 1, createdAt: -1 });
    blueprintSchema.index({ deletedAt: 1, gameVersion: 1, category: 1, createdAt: -1 });
    // "Most liked" sort on the public feed
    blueprintSchema.index({ deletedAt: 1, likeCount: -1, createdAt: -1 });

    BlueprintModel.model = mongoose.model<Blueprint>('Blueprint', blueprintSchema);
  }
}
