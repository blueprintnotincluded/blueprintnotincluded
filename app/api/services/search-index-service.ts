import crypto from 'crypto';
import mongoose from 'mongoose';
import { ClusterItem, contentClusterKey } from '../../../lib/index';
import { Blueprint } from '../models/blueprint';
import { BlueprintSearchModel, mongoTextLang, SearchRowOrigin } from '../models/blueprint-search';
import { getSearchTermDictionary } from './search-term-dictionary';
import { detectLanguageCode } from './language-detection-service';
import { TranslationService } from './translation-service';

// Derives and upserts blueprintsearch rows (spec/multilingual-search-plan.md
// §2.1). Phase 0 scope: the authored 'en' pivot row only — every blueprint
// has one, which is the invariant later phases build on. Rows are derived
// and disposable; `npm run derive-search` rebuilds them all.

// Freshness-key encoding shared by every sourceHash below. JSON.stringify
// unambiguously delimits and escapes each field — title/description are
// free text and can contain whatever a naive join's separator is, so a
// plain `.join(' ')` can hash two genuinely different (title, description)
// pairs to the same string (e.g. title:"A ", description:"B" vs title:"A",
// description:" B"). That collision would silently defeat every place this
// hash is used as a content-pin (the backfill's freshness check, and phase
// 5's concurrent-save guard below).
function computeSourceHash(parts: readonly unknown[]): string {
  return crypto.createHash('sha256').update(JSON.stringify(parts), 'utf8').digest('hex').slice(0, 16);
}

export interface SearchRowFields {
  lang: string;
  textLang: string;
  origin: SearchRowOrigin;
  title: string;
  titleOriginal: string | null;
  description: string;
  terms: string[];
  termIds: string[];
  sourceHash: string;
  ratingAverage: number;
  ratingCount: number;
  downloadCount: number;
  forkCount: number;
  hotScore: number | null;
  blueprintCreatedAt: Date;
  isPublished: boolean;
  deletedAt: Date | null;
  clusterKey: string | null;
}

interface StoredItem {
  id?: unknown;
  position?: { x?: unknown; y?: unknown } | unknown[];
  orientation?: unknown;
}

function storedItems(blueprint: Blueprint): StoredItem[] {
  try {
    return (blueprint.data as { blueprintItems?: StoredItem[] })?.blueprintItems ?? [];
  } catch {
    return [];
  }
}

function coord(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

// Stored positions are Vector2 objects; some fixtures (and older writes) use
// a [x, y] pair. Tolerate both — a position we can't read becomes the origin,
// which at worst puts two blueprints in different clusters.
function clusterItems(blueprint: Blueprint): ClusterItem[] {
  const items: ClusterItem[] = [];
  for (const item of storedItems(blueprint)) {
    if (item?.id == null) continue;
    const position = item.position;
    const x = Array.isArray(position) ? coord(position[0]) : coord(position?.x);
    const y = Array.isArray(position) ? coord(position[1]) : coord(position?.y);
    items.push({ id: String(item.id), x, y, orientation: coord(item.orientation) });
  }
  return items;
}

// Distinct content ids of the blueprint: placed building prefab ids plus
// detected room type ids. Language-independent by construction — this is the
// structural retrieval backbone (§2.3 B). An unparseable data blob yields
// just the room ids; a save with unparseable data has bigger problems and
// must not fail on search derivation (same policy as mod-derivation).
function contentTermIds(blueprint: Blueprint): string[] {
  const ids = new Set<string>();
  for (const item of storedItems(blueprint)) {
    if (item?.id != null) ids.add(String(item.id));
  }
  // Editor annotations are not searchable nouns.
  ids.delete('Element');
  ids.delete('Info');
  for (const room of blueprint.rooms ?? []) ids.add(room);
  return [...ids].sort();
}

export function deriveSearchRow(blueprint: Blueprint): SearchRowFields {
  const dictionary = getSearchTermDictionary();
  const termIds = contentTermIds(blueprint);
  const terms = termIds
    .map(id => dictionary.byId[id])
    .filter((name): name is string => name != null);

  const title = blueprint.name ?? '';
  const description = blueprint.description ?? '';
  const clusterKey = contentClusterKey(clusterItems(blueprint));
  // Freshness key for the backfill: everything the row derives from, cluster
  // key included (buildings move without changing termIds, so a rearranged
  // blueprint must still re-derive).
  // Ranking signals are deliberately excluded — they update cheaply in place
  // without re-deriving terms.
  const sourceHash = computeSourceHash([title, description, termIds, clusterKey]);

  // This row's `lang` stays 'en' regardless of the title's actual language —
  // that's the pivot invariant (§2.1): structural retrieval (the backbone for
  // 99.5% of the corpus, per search-service.ts) only ever queries lang:'en'
  // rows, so every blueprint needs one. A non-English title lives here
  // verbatim until deriveSearchRowWithTranslation below replaces it with a
  // machine-translated one; origin distinguishes the two.
  const lang = 'en';

  return {
    lang,
    textLang: mongoTextLang(lang),
    origin: 'authored',
    title,
    // Null while authored: `title` already holds this text, and duplicating it
    // would double its weight in the text index. Set only by the writers below
    // that replace `title` with a translation (Part 1 §1).
    titleOriginal: null,
    description,
    terms,
    termIds,
    sourceHash,
    ratingAverage: blueprint.ratingAverage ?? 0,
    ratingCount: blueprint.ratingCount ?? 0,
    downloadCount: blueprint.downloadCount ?? 0,
    forkCount: blueprint.forkCount ?? 0,
    hotScore: blueprint.hotScore ?? null,
    blueprintCreatedAt: blueprint.createdAt,
    isPublished: blueprint.isPublished !== false,
    deletedAt: blueprint.deletedAt ?? null,
    clusterKey,
  };
}

export async function upsertSearchRow(blueprint: Blueprint): Promise<void> {
  const fields = deriveSearchRow(blueprint);
  await BlueprintSearchModel.model.updateOne(
    { blueprintId: blueprint._id as mongoose.Types.ObjectId, lang: fields.lang },
    { $set: fields },
    { upsert: true }
  );
}

// Whether a title is confidently written in a language other than English —
// the gate for spending a translation call (spec/multilingual-search-plan.md
// phase 3b). Deliberately NOT `blueprint.sourceLang`, which may be nothing
// more than a locale-prior guess with no support from the text itself (e.g.
// an English "SPOM v2" title saved by an author whose browser declares a
// non-English Accept-Language) — only a statistically confident read of the
// title itself is trusted enough to bill for, and to mark a row 'machine'.
function confidentTitleLang(title: string): string | null {
  const lang = detectLanguageCode(title);
  return lang != null && lang !== 'en' ? lang : null;
}

// Machine English pivot (phase 3b): when a title is confidently non-English,
// translate it so an English searcher's lexical query can find it. The row's
// `lang` never changes — it's already 'en' (see deriveSearchRow) — only
// `title`/`origin` do. Falls back to the untranslated fields whenever
// translation isn't warranted, isn't configured, or fails; never fatal, same
// policy as every other search-derivation step. `sourceHash` is unaffected
// either way (it hashes the ORIGINAL inputs, not the translated output), so a
// later backfill run can tell a translated row is still fresh without
// re-translating it.
export async function deriveSearchRowWithTranslation(
  blueprint: Blueprint,
  userId: string | null
): Promise<SearchRowFields> {
  const base = deriveSearchRow(blueprint);
  const sourceLang = confidentTitleLang(base.title);
  if (sourceLang == null) return base;
  if (!TranslationService.instance.isConfigured()) return base;

  try {
    const result = await TranslationService.instance.translateOne(
      { sourceText: base.title, sourceLang, targetLang: 'en' },
      userId
    );
    if (result.degraded) return base;
    // titleOriginal keeps the authored text in the index, so a translation can
    // only ever ADD a match, never remove one — the mitigation that makes
    // provider-side detection (Part 1 §2) safe to trust.
    return {
      ...base,
      title: result.translatedText,
      titleOriginal: base.title,
      origin: 'machine',
    };
  } catch (err) {
    console.log('title translation error');
    console.log(err);
    return base;
  }
}

// Fire-and-forget follow-up to upsertSearchRow, called from the save path: a
// translation call can take up to 15s, so this never blocks the response —
// the corpus becomes searchable to English queries moments after the save
// completes, not atomically with it (same rationale as syncSearchRowStatus
// below). A no-op write when translation wasn't warranted — the authored row
// upsertSearchRow already wrote is left alone.
export function syncMachineTitle(blueprint: Blueprint, userId: string | null): void {
  deriveSearchRowWithTranslation(blueprint, userId)
    .then(fields => {
      if (fields.origin !== 'machine') return;
      // sourceHash pins this write to the content the translation was
      // actually computed for — a rapid re-save before this resolves changes
      // the row's sourceHash, and this update should then no-op rather than
      // clobber the newer save's title with a stale translation.
      return BlueprintSearchModel.model.updateOne(
        {
          blueprintId: blueprint._id as mongoose.Types.ObjectId,
          lang: fields.lang,
          sourceHash: fields.sourceHash,
        },
        { $set: { title: fields.title, titleOriginal: fields.titleOriginal, origin: fields.origin } }
      );
    })
    .catch(err => {
      console.log('machine title sync error');
      console.log(err);
    });
}

// Cheap status/signal patch for write paths that don't touch content
// (delete, publish flip, rating recompute): updates every language row
// without re-deriving terms — which would need the full data blob these
// paths never load. Fire-and-forget, same rationale as syncSearchRow.
export function syncSearchRowStatus(
  blueprintId: string | mongoose.Types.ObjectId,
  patch: Partial<
    Pick<SearchRowFields, 'isPublished' | 'deletedAt' | 'ratingAverage' | 'ratingCount' | 'hotScore' | 'downloadCount' | 'forkCount'>
  >
): void {
  BlueprintSearchModel.model
    .updateMany({ blueprintId }, { $set: patch })
    .catch(err => {
      console.log('search index status sync error');
      console.log(err);
    });
}

// Phase 5 (spec/multilingual-search-plan.md — lazy accretion): a reader who
// JIT-translates a blueprint's description is real, zero-cost-to-detect
// evidence that this blueprint matters to someone searching in that
// language. Promote the result into a blueprintsearch row for that lang —
// the corpus in language X then builds itself from actual reader demand,
// ahead of any .po acquisition (§7.3) or query-translation traffic (phase 4)
// in that language. Scope: blueprint title/description only. Comment bodies
// are also JIT-translated (translation-controller.ts's translateComments)
// but blueprintsearch has no per-comment content field — rows are one per
// (blueprintId, lang), not one per comment — and at 3 live comments
// site-wide (§0) there is no search corpus there to accrete into.
//
// origin is always 'machine' here: every call that reaches this function is
// a provider translation. TranslationUnit.reviewedBy exists for a future
// human-correction path (§0.5); when that path exists, IT should flip the
// affected row's origin to 'human' — this function has no way to know a
// translation was ever reviewed and must not guess.
//
// Builds on the existing 'en' pivot row rather than the raw blueprint
// document: termIds/terms/clusterKey and the ranking signals are language-
// independent and already sitting on that row, so this needs no `data` blob
// fetch (~85KB/blueprint average) on every reader translate click — only the
// title, which the JIT description-translate request doesn't already carry,
// costs a fresh (cached) translateOne call. Falls back to an empty
// terms/termIds row when the pivot is missing (should not happen once
// `derive-search` has backfilled a blueprint, but this must never be fatal —
// same policy as every other derivation step in this file).
//
// NEVER writes when targetLang is 'en': 'en' is the pivot row every other
// piece of retrieval depends on, and it already has its own dedicated,
// race-safe writer — phase 3b's syncMachineTitle, which pins its update to
// the sourceHash it computed the translation for. A reader translating an
// already-English-titled blueprint INTO English (a real case — 'en' is one
// of the four UI locales) must not blindly stomp that row with a redundant
// re-translation of a title that's often already correct.
export async function upsertTranslatedSearchRow(params: {
  blueprintId: mongoose.Types.ObjectId;
  sourceLang: string | null;
  targetLang: string;
  title: string;
  translatedDescription: string;
  userId: string | null;
}): Promise<void> {
  const { blueprintId, sourceLang, targetLang, title, translatedDescription, userId } = params;
  if (targetLang === 'en') return;

  const base = await BlueprintSearchModel.model.findOne({ blueprintId, lang: 'en' }).lean();

  let translatedTitle = title;
  try {
    const result = await TranslationService.instance.translateOne({ sourceText: title, sourceLang, targetLang }, userId);
    if (!result.degraded) translatedTitle = result.translatedText;
  } catch (err) {
    console.log('lazy accretion title translation error');
    console.log(err);
  }

  // The title call above can take up to 15s — long enough for the author to
  // re-save in the meantime and change the en pivot row out from under this
  // write. Revalidate the pivot's sourceHash right before writing: a change
  // (or the pivot vanishing) means the termIds/terms/clusterKey/ranking
  // signals captured in `base` no longer describe the blueprint's current
  // content, so discard rather than accrete a row built on stale signals —
  // the next reader translate click (or the next save's own derivation)
  // will re-derive against the fresh state.
  if (base != null) {
    const fresh = await BlueprintSearchModel.model.findOne({ blueprintId, lang: 'en' }).select('sourceHash').lean();
    if (fresh?.sourceHash !== base.sourceHash) return;
  }

  const termIds = base?.termIds ?? [];
  const terms = base?.terms ?? [];
  const clusterKey = base?.clusterKey ?? null;
  const sourceHash = computeSourceHash([translatedTitle, translatedDescription, termIds, clusterKey]);

  await BlueprintSearchModel.model.updateOne(
    { blueprintId, lang: targetLang },
    {
      $set: {
        textLang: mongoTextLang(targetLang),
        origin: 'machine',
        title: translatedTitle,
        // Only when a translation actually happened; a provider that returned
        // the input unchanged has produced no second form to preserve.
        titleOriginal: translatedTitle === title ? null : title,
        description: translatedDescription,
        terms,
        termIds,
        clusterKey,
        sourceHash,
        ratingAverage: base?.ratingAverage ?? 0,
        ratingCount: base?.ratingCount ?? 0,
        downloadCount: base?.downloadCount ?? 0,
        forkCount: base?.forkCount ?? 0,
        hotScore: base?.hotScore ?? null,
        blueprintCreatedAt: base?.blueprintCreatedAt ?? new Date(),
        isPublished: base?.isPublished ?? true,
        deletedAt: base?.deletedAt ?? null,
      },
    },
    { upsert: true }
  );
}

// Fire-and-forget entry point — called from translation-controller.ts right
// after a description JIT-translation succeeds. Same rationale as
// syncMachineTitle: a provider call can take up to 15s, so this patches the
// search corpus moments after the reader's response, not atomically with it.
export function syncTranslatedSearchRow(params: {
  blueprintId: mongoose.Types.ObjectId;
  sourceLang: string | null;
  targetLang: string;
  title: string;
  translatedDescription: string;
  userId: string | null;
}): void {
  upsertTranslatedSearchRow(params).catch(err => {
    console.log('lazy accretion search row sync error');
    console.log(err);
  });
}
