import mongoose, { Schema, Document, Model } from 'mongoose';
import {
  CATEGORIES,
  RESEARCH_TIERS,
  ROOM_TYPE_IDS,
  RAW_SOURCE_FORMATS,
  RawSourceFormat,
  MAX_BLUEPRINT_NAME_LENGTH,
  isCanonicalBlueprintName,
} from '../../../lib/index';

// Discriminator for the stored thumbnail: 'real' = data-URI image, the other
// two are placeholder sentinels stored verbatim in `thumbnail`. Exists so list
// queries can know real-vs-sentinel without fetching the blob (a find()
// projection can't prefix-test a field).
export const THUMBNAIL_TYPES = ['real', 'svg', 'svg_nothing'] as const;
export type ThumbnailType = (typeof THUMBNAIL_TYPES)[number];

// Shared by every write site that sets `thumbnail` (upload/save, fork, seeds)
// and by the backfill migration: sentinels map to themselves, anything else is
// a real image.
export function thumbnailTypeOf(thumbnail: string | null | undefined): ThumbnailType {
  if (thumbnail === 'svg' || thumbnail === 'svg_nothing') return thumbnail;
  return 'real';
}

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
  // No schema default (same hydration rationale as isPublished): docs
  // predating the backfill migration lack the field — readers fall back to
  // 'real', the overwhelmingly common case.
  thumbnailType?: ThumbnailType;
  isCopy?: boolean;
  copyOf?: string;
  data: any;
  deletedAt?: Date | null;
  // Draft state: false = draft (owner/admin only). Docs predating the backfill
  // migration lack the field — doc-level checks must treat missing as published
  // (isPublished !== false); feed queries match { isPublished: { $in: [true, null] } }
  // (same coverage as $ne: false, but point index bounds — see PUBLISHED_FILTER
  // in blueprint-controller) so those documents stay visible until the migration runs.
  isPublished?: boolean;
  // Raw Klei DLC ids (EXPANSION1_ID, DLC2_ID, …) required to build this
  // blueprint — the union of its buildings' dlcIds, server-derived on every
  // save (never client-supplied, same policy as rooms/mods). Unordered set:
  // [] = base game only, absent = never derived (legacy docs, until the
  // derive-metadata backfill runs). Stored raw so a display-name change can
  // never invalidate stored data (spec/dlc-requirements-plan.md).
  requiredDlcs?: string[];
  category?: string | null;
  subcategory?: string | null;
  description?: string | null;
  // ISO-639-1 language of `description`, server-derived on every save (never
  // client-supplied, same nullability convention as `rooms`): null = detection
  // ran and was not confident, absent = never derived (legacy docs, until the
  // derive-language backfill runs). No schema default — same hydration
  // rationale as isPublished/mods.
  sourceLang?: string | null;
  researchTier?: string | null;
  modded?: boolean | null;
  // Workshop ids of the mods this blueprint's buildings come from. Server-derived
  // on every save (mod-derivation-service); absent on legacy docs until the
  // derive-metadata backfill runs. [] = derived, no known-mod buildings.
  mods?: string[];
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
  // Verbatim BlueprintsV2 upload (the .blueprint JSON text or share-string)
  // — the byte-exact source of truth for re-download (spec/blueprintsv2-
  // import-spec.md §8). Present only while the stored `data` still matches
  // the imported content: any edit-save or version restore clears it, so a
  // served raw file can never disagree with the rendered blueprint. Must be
  // excluded from every list query (like `data`).
  rawSource?: string | null;
  rawSourceFormat?: RawSourceFormat | null;
  // Materialized trending score ("new but also good"), computed by
  // lib computeHotScore and refreshed on every engagement write (ratings,
  // download flush) + at creation. Static per document (recency term is keyed
  // on createdAt, not the clock), so the trending sort is a plain indexed
  // sort. No schema default: docs predating the backfill lack it and sort last
  // under { hotScore: -1 } until the migration runs.
  hotScore?: number;
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
        // Titles are Unicode (spec/multilingual-search-plan.md phase 3a); the
        // policy lives in lib so the save dialog, the upload endpoint and this
        // schema cannot disagree. The schema deliberately demands the
        // *canonical* form (NFC, collapsed whitespace) rather than normalizing
        // here: normalization belongs at ingress, and a non-canonical name
        // reaching a model write means some path skipped it.
        validate: {
          validator: isCanonicalBlueprintName,
          message: 'Blueprint name is not a valid, normalized title',
        },
        maxlength: [
          MAX_BLUEPRINT_NAME_LENGTH,
          `Blueprint name must be ${MAX_BLUEPRINT_NAME_LENGTH} characters or fewer`,
        ],
        minlength: [1, 'Blueprint name is required'],
      },
      ratingCount: { type: Number, default: 0 },
      ratingAverage: { type: Number, default: 0 },
      createdAt: Date,
      modifiedAt: Date,
      thumbnail: String,
      thumbnailType: { type: String, enum: THUMBNAIL_TYPES },
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
      // No enum: unknown-to-us DLC ids must still round-trip (a new pack ships
      // in an export before we know its name). default: undefined for the same
      // reason as mods — a schema default would make legacy docs read as
      // "derived, base game" on hydration and lose the never-derived signal.
      requiredDlcs: { type: [String], index: true, default: undefined },
      category: { type: String, enum: [...CATEGORIES, null], index: true },
      subcategory: { type: String, maxlength: 40 },
      description: { type: String, maxlength: 500 },
      researchTier: { type: String, enum: [...RESEARCH_TIERS, null] },
      // No default (see field comment): a schema default would make every
      // hydrated legacy doc read as "derived, not confident" and lose the
      // never-derived signal.
      sourceLang: { type: String, default: undefined },
      modded: { type: Boolean },
      // default: undefined (NOT []) — a schema default would make every hydrated
      // legacy doc appear to have mods:[] and get written back on unrelated saves,
      // destroying the "absent until backfilled" signal. Same convention as the
      // draft-blueprints fields.
      mods: { type: [String], default: undefined },
      // No default: absent means "never derived", distinct from [] = "derived,
      // none found" (mirrors the requiredDlcs nullability convention).
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
      rawSource: { type: String, default: null },
      rawSourceFormat: { type: String, enum: [...RAW_SOURCE_FORMATS, null], default: null },
      // No default: absent = not yet materialized (pre-backfill), so those
      // docs sort last under { hotScore: -1 } rather than tying at 0.
      hotScore: { type: Number },
    });

    // Listing query: filter by createdAt range, sort by createdAt desc
    blueprintSchema.index({ createdAt: -1 });
    // Listing query with owner filter
    blueprintSchema.index({ owner: 1, createdAt: -1 });
    // Upload duplicate-name check: find({ owner, name })
    blueprintSchema.index({ owner: 1, name: 1 });

    // Discovery feed indexes (deletedAt: null AND isPublished: true = public)
    blueprintSchema.index({ deletedAt: 1, isPublished: 1, createdAt: -1 });
    blueprintSchema.index({ deletedAt: 1, isPublished: 1, category: 1, createdAt: -1 });
    // DLC-requirement filters on the public feed (multikey on requiredDlcs;
    // one array field per compound index, category/createdAt are scalars).
    blueprintSchema.index({ deletedAt: 1, isPublished: 1, requiredDlcs: 1, createdAt: -1 });
    blueprintSchema.index({
      deletedAt: 1,
      isPublished: 1,
      requiredDlcs: 1,
      category: 1,
      createdAt: -1,
    });
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
    // "Trending" sort — materialized hotScore. Unfiltered feed only for now;
    // filter-scoped (category/rooms) hotScore indexes are a metrics-gated
    // TODO (spec/trending-hotscore-plan.md §6).
    blueprintSchema.index({ deletedAt: 1, isPublished: 1, hotScore: -1, createdAt: -1 });

    BlueprintModel.model = mongoose.model<Blueprint>('Blueprint', blueprintSchema);
  }
}
