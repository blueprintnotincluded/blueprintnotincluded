import mongoose, { Document, Model } from 'mongoose';

// Query-side telemetry (spec/multilingual-search-plan.md phase 4): one row
// per distinct (normalizedQuery, sourceLang) pair, so a repeated vocabulary
// of a few hundred real queries costs a few hundred rows, not one per
// request. Recorded on EVERY search — resolved-with-no-translation and
// English queries included — because the point is the language
// distribution itself (which `.po` to acquire next, §2.2), not just the
// queries that spent money. `sourceLang` is null when detection had neither
// a confident statistical read nor a locale prior to fall back on; that is
// still a real bucket in the distribution, so it is logged, not dropped.
export interface SearchQuery extends Document {
  normalizedQuery: string;
  sourceLang: string | null;
  // Whether the most recent occurrence of this query used a machine
  // translation to reach its results — can flip between true/false across
  // occurrences (a budget exhausted on one request may have recovered by
  // the next).
  translated: boolean;
  hitCount: number;
  lastSeenAt: Date;
}

export class SearchQueryModel {
  static model: Model<SearchQuery>;

  public static init() {
    const schema = new mongoose.Schema(
      {
        normalizedQuery: { type: String, required: true },
        sourceLang: { type: String, default: null },
        translated: { type: Boolean, default: false },
        hitCount: { type: Number, default: 0 },
        lastSeenAt: { type: Date, default: Date.now },
      },
      { collection: 'searchqueries' }
    );

    schema.index({ normalizedQuery: 1, sourceLang: 1 }, { unique: true });

    SearchQueryModel.model =
      (mongoose.models['SearchQuery'] as Model<SearchQuery>) ??
      mongoose.model<SearchQuery>('SearchQuery', schema);
  }
}
