import mongoose, { Document, Model, Schema } from 'mongoose';

// Search documents (spec/multilingual-search-plan.md §2.1): one row per
// (blueprintId, lang), derived and disposable — same policy as rooms/mods/
// requiredDlcs. Dropping the collection costs a `npm run derive-search`
// backfill, never data. A separate collection exists because Mongo allows
// exactly one text index per collection and the blueprints collection can't
// spare it (and its rows must be per-language for per-row stemming).
//
// Rows are advisory for retrieval only: the final page fetch always
// re-applies the authoritative filter (deletedAt/isPublished/owner…) against
// the blueprints collection, so a stale row can cost recall, never leak a
// deleted or draft blueprint.

// Search rows are an OPEN language set ('vi' is valid with no Vietnamese UI
// build — that's what lets the corpus accrete ahead of a UI translation),
// but Mongo's text stemmer list is not: an unsupported language_override
// value fails the write. So `lang` stays ISO and `textLang` carries what the
// text index actually uses — a supported code or 'none'.
const MONGO_TEXT_LANGS = new Set([
  'da', 'nl', 'en', 'fi', 'fr', 'de', 'hu', 'it', 'nb', 'pt', 'ro', 'ru', 'es', 'sv', 'tr',
]);

export function mongoTextLang(lang: string): string {
  return MONGO_TEXT_LANGS.has(lang) ? lang : 'none';
}

export type SearchRowOrigin = 'authored' | 'machine' | 'human';
const SEARCH_ROW_ORIGINS: SearchRowOrigin[] = ['authored', 'machine', 'human'];

export interface BlueprintSearch extends Document {
  blueprintId: mongoose.Types.ObjectId;
  lang: string;
  // What the text index stems this row with (language_override target).
  textLang: string;
  origin: SearchRowOrigin;
  title: string;
  // The author's own title, retained ONLY when `title` has been replaced by a
  // translation (spec/search-followups.md Part 1 §1). Before this field, a row
  // flipping to `origin: 'machine'` deleted the authored text from the index
  // entirely: 'Cozinha estrategia em choque' became findable by "strategic
  // cooking" and no longer by its own words. That is worst exactly where
  // query translation also fails — romanized or diacritic-stripped text, whose
  // language neither end detects — so both ends broke at once and the literal
  // fallback had been thrown away.
  //
  // null while `origin` is 'authored', deliberately: there it would duplicate
  // `title` verbatim and double that text's weight in the text index for no
  // gain. It is derived wholesale, never appended to, so it cannot accumulate
  // stale pseudo-titles the way a `terms[]` entry would have.
  titleOriginal: string | null;
  description: string;
  // Localized display names of contained buildings/rooms — text-searchable.
  terms: string[];
  // Prefab/room ids — language-independent, the structural retrieval backbone.
  termIds: string[];
  // Duplicate-cluster membership (§2.5): a content hash, not a foreign key —
  // rows sharing a key are the cluster, so membership is derivable per
  // document with no global pass and no cluster collection. null = nothing
  // placed (never clustered). The canonical member is elected at read time
  // against the visible result set, never stored.
  clusterKey: string | null;
  // Hash of the derivation inputs — lets the backfill skip fresh rows.
  sourceHash: string;
  // Denormalized ranking signals so a search is one query against one
  // collection; the blueprint fetch happens only for the final page.
  ratingAverage: number;
  ratingCount: number;
  downloadCount: number;
  forkCount: number;
  hotScore: number | null;
  blueprintCreatedAt: Date;
  isPublished: boolean;
  deletedAt: Date | null;
  updatedAt: Date;
}

export class BlueprintSearchModel {
  static model: Model<BlueprintSearch>;

  public static init() {
    const searchSchema = new mongoose.Schema(
      {
        blueprintId: { type: Schema.Types.ObjectId, ref: 'Blueprint', required: true },
        lang: { type: String, required: true },
        textLang: { type: String, required: true, default: 'none' },
        origin: { type: String, enum: SEARCH_ROW_ORIGINS, required: true },
        title: { type: String, required: true, default: '' },
        titleOriginal: { type: String, default: null },
        description: { type: String, default: '' },
        terms: { type: [String], default: [] },
        termIds: { type: [String], default: [] },
        clusterKey: { type: String, default: null },
        sourceHash: { type: String, required: true },
        ratingAverage: { type: Number, default: 0 },
        ratingCount: { type: Number, default: 0 },
        downloadCount: { type: Number, default: 0 },
        forkCount: { type: Number, default: 0 },
        hotScore: { type: Number, default: null },
        blueprintCreatedAt: { type: Date },
        isPublished: { type: Boolean, default: true },
        deletedAt: { type: Date, default: null },
      },
      { timestamps: true, collection: 'blueprintsearch' }
    );

    searchSchema.index({ blueprintId: 1, lang: 1 }, { unique: true });
    searchSchema.index({ termIds: 1 });
    searchSchema.index({ clusterKey: 1 });
    // Adding/removing a field here changes the index definition, which Mongo
    // will not do in place — see migrations/20260804000000_search-title-original.js,
    // which drops and recreates it under the same name.
    //
    // titleOriginal sits at the `terms` weight, not `title`'s: a
    // machine-translated row holds both forms, and equal weighting would make
    // it compete with itself, letting a translated row outrank an authored one
    // purely for carrying the same text twice.
    searchSchema.index(
      { title: 'text', titleOriginal: 'text', terms: 'text', description: 'text' },
      {
        weights: { title: 10, titleOriginal: 4, terms: 4, description: 1 },
        language_override: 'textLang',
        default_language: 'en',
        name: 'blueprint_search_text',
      }
    );

    BlueprintSearchModel.model =
      (mongoose.models['BlueprintSearch'] as Model<BlueprintSearch>) ??
      mongoose.model<BlueprintSearch>('BlueprintSearch', searchSchema);
  }
}
