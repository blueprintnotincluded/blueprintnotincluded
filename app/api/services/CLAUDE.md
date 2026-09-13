# app/api/services/ — design notes

Design rationale for the backend services in this directory. Loaded
automatically by Claude Code when working here. See root `CLAUDE.md` for
project-wide setup, commands, and constraints.

### Search (blueprintsearch) & user-content translation

All shipped and activated in prod (2026-08-27). Current status doc: `spec/language-plan.md`;
the plan docs referenced below (`multilingual-search-plan.md`, `search-followups.md`) are
archived under `spec/archive/` and kept for design rationale only.

- **Search documents** — `blueprintsearch` collection (`app/api/models/blueprint-search.ts`),
  one row per `(blueprintId, lang)`; every blueprint has an `en` row (the pivot invariant).
  Holds title/`titleOriginal`/description/`terms[]` (display names) under the collection's
  single text index (title 10 / titleOriginal 4 / terms 4 / description 1,
  `language_override: 'textLang'` — ISO `lang` stays an
  open set, `textLang` maps unsupported stemmers to `none`), `termIds[]` (prefab + room ids,
  language-independent), and denormalized ranking signals. Rows are **derived and disposable**
  (`npm run derive-search[:dry-run]`, `--limit N`); they are advisory for retrieval only — the
  final page fetch re-applies the authoritative filter on `blueprints`, so a stale row can cost
  recall but never leak a draft/deleted doc. Save path upserts the row (awaited, non-fatal);
  delete/publish/rating-recompute patch status/signals fire-and-forget. **The row is now also a
  display source** — see "Content locale" below for why that widening is judged safe.
- **Retrieval** (`app/api/services/search-service.ts`) — normalize → term-resolve → lexical
  (`$text`) + structural (`termIds` ∩ resolved ids) → RRF fuse → rank. Pure pieces live in
  `lib/src/search/` (`query-normalize`, `term-resolve`, `rrf`, `ranking` — the ranking spec
  asserts ordering properties, not scores). Term dictionary is built lazily from the loaded
  `OniItem` display names + room names + `assets/search-aliases.json` (hand-maintained jargon:
  `spom`, `aquatuner`, …; validate ids against the database when editing).
  `lexicalRetrieval` widens its `$in` to `[viewerLang, 'en']` (`SearchOptions.viewerLang`,
  threaded from the same `?lang=` the content-locale picker introduced) rather than
  hard-coding `'en'` — search-followups.md Part 1 §4. `structuralRetrieval` deliberately stays
  `en`-only: `termIds` are language-independent and identical across a blueprint's rows, so
  widening it would only return a duplicate row for no new signal. Rows are deduped to one per
  blueprint before fusion — `fuseRanks` has no id-uniqueness precondition on its input arrays,
  so a duplicate id would otherwise double-add its RRF score.
- **Native-language rows** (§2.9) — `deriveNativeSearchRow`/`upsertSearchRow`
  (`search-index-service.ts`) write a second row per blueprint, `lang: blueprint.sourceLang`,
  `origin: 'authored'`, holding the title/description verbatim (never `titleOriginal` — this
  row IS the original). Kept alongside `titleOriginal` rather than replacing it: `titleOriginal`
  is the language-independent floor (works with no declared/detected `sourceLang` at all);
  the native row is the precision upgrade once a language is known, since it gets Mongo's real
  per-language stemmer via `language_override`, which a field on an `en`-stemmed row cannot
  provide. Stale rows (title re-authored in a different language) are pruned on the next save,
  scoped to `origin: 'authored'` so a phase-5 accreted `origin: 'machine'` row in some other
  language is never touched.
- **Endpoint integration** — `filterName` on `getblueprints`/`blueprintfacets` resolves through
  the search service to a ranked id list (`_id $in`); under the default `recent` sort the page
  is a rank-ordered slice (offset pagination — the client sends `skip` and drops the
  `olderthan` cursor whenever a name search is active), while explicit count sorts keep their
  own order with search as a filter. Kill switch `SEARCH_V2_ENABLED=false` reverts to the
  legacy escaped-regex substring match, which also remains the automatic fallback if the
  search layer errors.
- **Translation cache** — `translationunits` (`app/api/models/translation-unit.ts`), keyed
  `{textHash, sourceLang('auto' when unknown), targetLang, mode}` — by **text**, never by document:
  identical text is billed once per full cache key, so every document sharing a title and a
  target language reuses one translation. Differing on any key component — a second target
  language, or the Gemini mode against the standard one — is a separate row and a separate
  charge. `mode:'standard'` preserves Google/human behavior;
  accepted Gemini romanized-Vietnamese titles use `mode:'vi-romanized-title-v1'`, source `vi`,
  target `en`, plus immutable prompt/model, restored Vietnamese, and token provenance.
  Ambiguous/negative/invalid Gemini answers are never cached. Google character-budget behavior
  is unchanged; Gemini maximum/observed micro-USD and token accounting shares the site-month row
  in `translation-budget.ts`.
- **Language detection** — `detectLanguage(text, {prior}) → {lang, confidence:
'high'|'prior'|'none'}` (`language-detection-service.ts`): statistical margin for ≥20 chars;
  short texts need a stronger margin AND a non-ASCII signal, else they fall to the caller's
  prior (recorded as `'prior'` so callers can decide whether to spend money on it).
  `detectLanguageCode()` is the high-confidence-only convenience the save paths use.
- **Translate UI gating** — `BlueprintDetailsResponse.translationEnabled` (server
  `isConfigured()`); the details page and comment section render no Translate affordance
  without it, so an unconfigured prod never shows a button that 503s.
- **Duplicate collapse** (phase 2) — measured on a prod restore: 651 groups of byte-identical
  content cover **47% of live blueprints**, the largest being 90 documents from 86 distinct
  owners (the pre-fork "save someone else's build into my account" workaround). Membership is
  a content hash — `contentClusterKey` in `lib/src/search/cluster-key.ts` over sorted
  `id:x:y:orientation` tuples translated to the origin — stored as `clusterKey` on the search
  row. Rows sharing a key ARE the cluster: no cluster collection, no stored canonical, no
  global pass, so a save derives its own membership. The plan's `clusterId: ObjectId` and its
  second signal (multiset Jaccard for near-duplicates) are deliberately not built; the latter
  can't be computed per document. `clusterKey` is part of the row's `sourceHash`, so
  `npm run derive-search` re-derives every pre-phase-2 row.
  Collapse itself is **read-time and view-only** (`collapseClusters`): it runs after the
  authoritative visibility filter, so a deleted or draft canonical can never suppress a
  visible copy, and it applies under **every** sort a search can use — the default sort is
  trending, so a relevance-only collapse would never fire in the UI. The canonical is elected
  by engagement, falling back to earliest `createdAt` (the probable original). Nothing is
  deleted or hidden: every copy keeps its URL and its owner's profile listing. `collapse=false`
  opts out (`?collapse=` on `getblueprints`, round-tripped through the Discover URL; the
  "Group identical copies" toggle appears only while a search is active, and the card shows a
  `+N copies` chip). **Facet counts never collapse** — a category count describes the corpus,
  not the view, so the sidebar can legitimately read 4 where the list shows 1.
- **Title translation pivot** (phase 3b) — `sourceLang` on `Blueprint` is derived from `name`,
  not `description` (titles are the corpus; descriptions are 22 documents site-wide), using
  `detectLanguage`'s locale prior — the author's `Accept-Language` header, the closest thing
  the backend has to "UI locale" since the frontend's four-locale build is a static path
  choice never sent to the API. A confidently non-English title (`detectLanguageCode`, no
  prior — deliberately stricter than the stored `sourceLang`, which may be only a prior-based
  guess) is machine-translated into the blueprint's existing `en` `blueprintsearch` row
  (`search-index-service.ts`'s `deriveSearchRowWithTranslation`/`syncMachineTitle`): the row's
  `lang` stays `'en'` — that's still the pivot invariant structural retrieval depends on — only
  `title`/`origin` flip to `'machine'`. Fired fire-and-forget from the save path (a provider
  call can take 15s) and via `npm run derive-search`'s second pass for the backfill, which
  batches by **unique title text**, not by document, so N duplicate titles cost one
  translation call. Verified against the real Google provider: a Vietnamese title saved
  through the live API produced `sourceLang: 'vi'` and a `blueprintsearch` row with
  `origin: 'machine'`, and an English query then found it.
- **`titleOriginal`** (`spec/archive/search-followups.md` Part 1 §1) — translating a title used to
  _replace_ it, deleting the author's own words from the index: `Cozinha estrategia em choque`
  became findable by "strategic cooking" and no longer by itself. Worst exactly where query
  translation also fails (romanized text neither end detects), so both directions broke at once.
  The field holds the authored text whenever `origin` is `'machine'` and is **null while
  `authored`**, where it would only duplicate `title` and double its index weight. Weighted 4,
  not 10 — at `title`'s weight a translated row competes with itself. Derived wholesale, never
  appended, so it cannot accumulate (the objection that ruled out `terms[]`).
  Adding it to the text index needs `migrations/20260804000000_search-title-original.js`:
  Mongo won't alter an index in place and Mongoose's autoIndex hits IndexOptionsConflict, which
  surfaces only as a logged error. **Deploy order: migrate, then `npm run derive-search`.**
  The backfill also fills the field on rows an earlier run already translated — those rows are
  _fresh_, so they never reach full re-derivation, and their `sourceHash` pins them to the
  current `blueprint.name`, making the authored text recoverable exactly with no provider call.
- **Provider-side detection** (`spec/archive/search-followups.md` Part 1 §2) — `derive-search`'s **second
  translation pass**, for titles `detectLanguageCode` can't place at all: short, romanized or
  diacritic-stripped non-English (`Dien phan full`). Those clear neither detection gate, so
  phase 3b never sees them and no amount of re-running it will. Candidates are rows still
  `origin: 'authored'` whose tokens the term dictionary does **not** fully resolve (an
  all-game-nouns title is already findable structurally — nothing to buy). **The trap:**
  `translateMany` short-circuits on `sourceLang == null && ASCII_ONLY`, which is exactly this
  candidate set, so the input carries `forceProviderDetection: true` to bypass it; without that
  the pass makes no provider call and still reports success. A result is accepted only when the
  provider reports a non-`en` source **and** changed the text. On by default;
  `--skip-provider-detect` opts out. Re-runs are cache reads (`translationunits` is keyed by
  text hash), so it is idempotent and near-free after the first.
- **Declared source language** (`spec/archive/search-followups.md` §2.6) — `saveBlueprint` prefers the
  author's stored `localePreference` over `Accept-Language` as the detection prior, and passes
  it to `syncMachineTitle`. On that path `confidence: 'prior'` **is** trusted, deliberately
  reversing the rule phase 3b set: same mechanism, different evidence — a browser header is a
  default nobody chose, a picker setting is the user's own statement. Guards keep a
  misdeclaration cheap: the provider must report non-`en`, and a provider that returns the input
  unchanged never marks the row `'machine'` (which would claim a translation that isn't there
  and index the same string twice).
- **Decided not to build** (`spec/archive/multilingual-search-plan.md` §8, 2026-08-04): IDF weighting
  for structural matches (needs a new maintained per-`termId` document-frequency table for an
  unmeasured payoff) and near-duplicate clustering + its fork-migration offer (needs a global
  pass; the offer is an unrequested product feature). Phase 6 semantic retrieval stays gated on
  `searchqueries` telemetry, re-checked 2026-08-04 and still nothing to justify starting — the
  trigger number is written into the plan's §4.5. `.po` acquisition is scoped but not decided —
  it needs real prod `sourceLang`/`searchqueries` traffic, which has only been accumulating
  since the 2026-08-27 activation; revisit once there is enough to characterize demand.

### Content locale (what language you read blueprints in)

`spec/archive/search-followups.md` Part 2. **Not** UI localization — the chrome stays English for
everyone (see "UI localization state"), so this routes no bundles and prefixes no paths.

- **The rule** (§2.5), one shared implementation in `lib/src/blueprint/content-locale.ts`'s
  `resolveTitle`: authored-in-your-language → a translation into your language → the English
  translation → the authored title. The last step is what lets this ship ahead of any backfill:
  it can never produce a blank title.
- **Applied at the response boundary only** — `app/api/services/title-resolution-service.ts`,
  used by the list, details, related-shelf and editor-open responses. One query per page;
  any failure yields authored titles for everything. Inlining the rule per endpoint is how a
  card and its details page end up disagreeing about a blueprint's name.
- **`Blueprint.name` is never mutated and never changes meaning.** The resolved title rides in
  a separate `displayName` (+`nameTranslated`/`nameSourceLang`), so the `{owner,name}` duplicate
  check, download filenames and the editor's save path keep reading authored text.
  Editor-open resolves for chrome only — the editor stores `name` and its save dialog pre-fills
  from it, so translating that field would rewrite the author's title on their next save.
- **`?lang=` is an explicit query param, never `Accept-Language`**: these responses are
  Cloudflare-cached and a param keys cleanly where `Vary: Accept-Language` fragments the cache
  per browser. The client omits it entirely for English, so the ordinary browse URL is
  unchanged. Facet counts take no `lang` — they return no titles.
- **Reading display titles from `blueprintsearch` widens its contract** from "advisory for
  retrieval only". Confirmed, not overturned, on three grounds: the chain always terminates at
  `Blueprint.name` so a lost row degrades to authored text; machine titles rebuild for free from
  the `translationunits` text-hash cache; and rows stay advisory for _visibility_ because the
  authoritative filter still runs against `blueprints`. The rejected alternative was a
  `titleTranslations` map on the blueprint document — more obviously correct, but a second write
  path and a migration for data that is already derivable.
- **`User.localePreference`** (base ISO tag) + `GET`/`PATCH /api/users/me/locale-preference`,
  mirroring `themePreference`/`dlcPreferences`: private, never in `ProfileResponse`, absent
  means "never chosen". It reports `null` rather than `'en'` when unset, unlike
  `themePreference` — the client's own default is `navigator.language`, and answering `'en'`
  would override that on every device. The language set is **open** (shape-validated only): a
  user may declare a language we never translate _into_.
- **Picker** — `components/dialogs/dialog-content-language/`, mounted in the site nav and opened
  off `ContentLocaleService.openRequests$`, so the user-menu entry and the ambient entry point
  on the details page both reach it with no component wiring. Three states kept distinct:
  declared (localStorage + account), guessed (`navigator.language`, **never persisted** — a
  default that writes itself is indistinguishable from a choice, which would ruin the §2.10
  "who reads in what language" measurement), and English. Login adopts a local declaration into
  an account that has none; a _failed_ lookup is explicitly not "the account has none", or one
  flaky GET would overwrite a preference set elsewhere. Selecting reloads the page — the locale
  is a request parameter, so everything on screen was fetched under the old one.
- **Disclosure is mandatory and ships with the display** (§2.7): cards carry a quiet
  `pi-language` glyph whose tooltip holds the author's original; the details page states the
  fact, shows the original, and links to the picker. Machine output is never presented as the
  author's own words.
