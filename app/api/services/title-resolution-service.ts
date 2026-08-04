import mongoose from 'mongoose';
import { resolveTitle, ResolvedTitle, TitleTranslation, DEFAULT_CONTENT_LOCALE } from '../../../lib/index';
import { Blueprint } from '../models/blueprint';
import { BlueprintSearchModel } from '../models/blueprint-search';

// Viewer-locale title resolution at the response boundary
// (spec/search-followups.md §2.5). ONE implementation, used by every endpoint
// that returns a blueprint title — the list, the details page, the related
// shelf and the editor-open payload. Inlining the rule per endpoint is how a
// card and its details page end up disagreeing about what a blueprint is
// called.
//
// Reading DISPLAY titles out of `blueprintsearch` is a deliberate widening of
// that collection's contract, which until now was "derived and disposable…
// advisory for retrieval only" (§2.4). Confirmed rather than overturned,
// because all three properties that made the old contract safe still hold:
//
//   - the resolution chain always terminates at `Blueprint.name`, so a stale,
//     missing or dropped row degrades to the authored title — never to blank;
//   - machine titles are reproducible for free from the `translationunits`
//     text-hash cache, so rebuilding the collection costs a `derive-search`
//     run and no money;
//   - rows stay advisory for VISIBILITY: the authoritative deleted/draft
//     filter still runs against `blueprints`, and titles are only ever
//     resolved for documents that already passed it, so a stale row still
//     cannot leak a draft.
//
// The alternative considered and rejected was a `titleTranslations: {lang:
// text}` map on the blueprint document — more obviously correct, but it costs
// a second write path and a migration to hold data that is already derivable.
// Revisit if the widened contract ever proves uncomfortable.

export type ResolvedTitleMap = Map<string, ResolvedTitle>;

interface TitleSource {
  _id: unknown;
  name: string;
  sourceLang?: string | null;
}

/**
 * Resolves the display title of every blueprint in `blueprints` for a viewer
 * reading in `viewerLang`.
 *
 * One query, never fatal: any failure yields authored titles for everything,
 * which is exactly what the site did before this feature existed.
 */
export async function resolveTitles(
  blueprints: readonly TitleSource[],
  viewerLang: string
): Promise<ResolvedTitleMap> {
  const resolved: ResolvedTitleMap = new Map();
  if (blueprints.length === 0) return resolved;

  // Rule 1 short-circuit: a blueprint authored in the viewer's own language
  // needs no lookup at all, and for an English reader browsing an
  // overwhelmingly English corpus that is most of the page.
  const needsLookup = blueprints.filter(
    b => b.sourceLang == null || b.sourceLang !== viewerLang
  );

  let translations = new Map<string, TitleTranslation[]>();
  if (needsLookup.length > 0) {
    try {
      // Only 'machine'/'human' rows are translations; an 'authored' row is the
      // pivot echoing Blueprint.name and would resolve a title to itself while
      // claiming it had been translated. Filtered in the query rather than in
      // resolveTitle so the common case moves no rows over the wire.
      const rows = await BlueprintSearchModel.model
        .find({
          blueprintId: { $in: needsLookup.map(b => b._id as mongoose.Types.ObjectId) },
          lang: { $in: [viewerLang, DEFAULT_CONTENT_LOCALE] },
          origin: { $ne: 'authored' },
        })
        .select('blueprintId lang title origin')
        .lean();

      for (const row of rows) {
        const key = row.blueprintId.toString();
        const list = translations.get(key);
        const entry: TitleTranslation = {
          lang: row.lang,
          title: row.title ?? '',
          origin: row.origin,
        };
        if (list != null) list.push(entry);
        else translations.set(key, [entry]);
      }
    } catch (err) {
      // A search-index outage must never take the browse page down with it —
      // every blueprint simply keeps its authored title.
      console.log('title resolution lookup error');
      console.log(err);
      translations = new Map();
    }
  }

  for (const blueprint of blueprints) {
    const key = (blueprint._id as { toString(): string }).toString();
    resolved.set(
      key,
      resolveTitle({
        authoredName: blueprint.name,
        sourceLang: blueprint.sourceLang ?? null,
        viewerLang,
        translations: translations.get(key),
      })
    );
  }

  return resolved;
}

/** Single-document convenience for the details and editor-open responses. */
export async function resolveOneTitle(
  blueprint: TitleSource,
  viewerLang: string
): Promise<ResolvedTitle> {
  const map = await resolveTitles([blueprint], viewerLang);
  return (
    map.get((blueprint._id as { toString(): string }).toString()) ?? {
      title: blueprint.name,
      original: blueprint.name,
      translated: false,
      sourceLang: blueprint.sourceLang ?? null,
    }
  );
}

/**
 * The response-shaped projection of a resolution. Emitted only when it says
 * something the `name` field doesn't already: an untranslated title sends no
 * extra bytes and, more importantly, no `nameTranslated: false` for a client
 * to mistake for a meaningful signal.
 */
export function titleFields(resolved: ResolvedTitle | undefined, authoredName: string) {
  if (resolved == null || resolved.title === authoredName) return {};
  return {
    displayName: resolved.title,
    nameTranslated: resolved.translated,
    nameSourceLang: resolved.sourceLang,
  };
}

/** Blueprint (document or lean) → the shape resolveTitles needs. */
export function titleSourceOf(blueprint: Blueprint): TitleSource {
  return { _id: blueprint._id, name: blueprint.name, sourceLang: blueprint.sourceLang ?? null };
}
