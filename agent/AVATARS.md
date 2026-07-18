# Avatar Generation (Gemini)

Operational reference for the duplicant-style avatar pipeline
(spec/social/avatars-identity.md, Direction A — Gemini-generated variant).

## Google-side setup

1. Go to https://aistudio.google.com/apikey (Google AI Studio → "Get API key").
2. "Create API key" → create in a new or existing Google Cloud project.
3. **Enable billing on that project** — image models have **no free tier**
   (`gemini-3.1-flash-image` quota is 0 without billing; you'll see
   `free_tier_... limit: 0` errors). In AI Studio the key page has a
   "Set up billing" link; it routes to the Cloud console billing page for the
   key's project.
4. Put the key in `.env` as `GEMINI_API_KEY` (never in `.env.sample` or any
   committed file). Prod: DO App Platform env var.
5. Verify: `npm run avatars:smoke` — one real grid generation (~$0.09 → four
   avatars), stores them in the pool and writes `avatar-smoke-test.png` (the
   grid) plus `avatar-smoke-test-{0..3}.png` (tiles, all gitignored) for
   eyeballing. `npm run avatars:smoke -- --seed path/to/photo.jpg` also
   exercises the face-classification path.

## Env vars

| var | default | notes |
| --- | --- | --- |
| `GEMINI_API_KEY` | unset | unset ⇒ loud startup error, avatar endpoints 503, everything else unaffected |
| `AVATAR_IMAGE_MODEL` | `gemini-3.1-flash-image` | 512px 1:1 jpeg output (`image/jpeg` is the only accepted `response_format.mime_type`) |
| `AVATAR_STYLE_REFERENCE` | `assets/avatar-reference/duplicant-style-sheet.jpg` | committed jpeg of the duplicant portrait sheet; attached first to every generation |
| `AVATAR_HATS_REFERENCE` | `assets/avatar-reference/duplicant-hats-sheet.jpg` | committed jpeg of the in-game hats sheet; attached second to every generation |
| `AVATAR_CLASSIFY_MODEL` | `gemini-3.5-flash` | cheap multimodal FACE/NOT_FACE pre-check |
| `AVATAR_POOL_LOW_WATER` | `5` | refill trigger threshold (0 disables refill — tests use this) |
| `AVATAR_POOL_REFILL` | `5` | avatars generated per refill |
| `AVATAR_GENERATE_COOLDOWN_MS` | `86400000` (24h) | per-user limit: one generation per rolling 24h window since their last batch, not a calendar-day/midnight reset |

## Cost

- Image generation runs in **2x2 grid mode**: one 512px call yields four
  256px avatars. Observed cost: ~1,400 output tokens ≈ **$0.09 per call ≈
  $0.02 per avatar** (the API minimum is 512px — 256 doesn't exist, so the
  grid trick is also what gets us native-resolution 256px tiles). Tiles are
  sliced with a ~4% inset because the model tends to draw thin frames around
  grid cells despite the prompt.
- The style + hats sheet references add only a few hundred input tokens each
  (~$0.0001/call) — attaching them always is effectively free, and they are
  what make output match Klei's duplicant portraits and recognizable in-game
  hats instead of generic cartoon.
- Face classification: ~1,200 tokens of `gemini-3.5-flash` per upload —
  fractions of a cent. Chosen over local face detection because proper on-box
  detection means TensorFlow/OpenCV native builds.
- Every provider call is recorded on an `avatarbatches` row (verbatim grid,
  `interactionId`, `usage`, `latencyMs`) — that's the cost log. Failed calls
  are recorded as `status: 'failed'` rows in `avatars`.

## How the pool works

- `avatars` rows with `{ status: 'ready', assignedTo: null }` are the unused
  pool. Sources: seed batches, refills, and released user avatars — every
  generated image is a reusable asset, nothing is discarded.
- Claiming is an atomic `findOneAndUpdate` on `{ _id, assignedTo: null }`
  (candidate picked by `$sample`, losers of a race retry), so two users can
  never receive the same avatar.
- Reassigning/regenerating releases the user's previous avatar back to the
  pool. `DELETE /api/users/me/avatar` does the same.
- After each pool assignment, an in-process fire-and-forget refill tops the
  pool up when it drops below `AVATAR_POOL_LOW_WATER`. Single-instance deploy
  assumption, same as BlueprintCounterService — move to a real job runner if
  the API is ever replicated.
- New signups get a best-effort pool assignment (never blocks registration;
  no-op when the pool is empty).

## Data model

- `avatarbatches` — one row per provider call: the full 2x2 grid exactly as
  returned (the paid asset, kept verbatim), prompt, sha256 (identical grids
  dedupe wholesale), usage/latency metadata.
- `avatars` — one row per tile: 256px png, sha256 (unique+sparse ⇒ dedupe),
  batchId + gridIndex, prompt + template id, sourceType (`random` |
  `user-upload` | `seed-batch`), assignment state. Binaries in Mongo per the
  previewimages precedent (~250KB/batch + ~100KB/tile, covered by backups).
- `avatarseeduploads` — user's uploaded seed photo, re-encoded through sharp
  (validates payload, strips EXIF, caps at 1024px jpeg), plus the face
  classification verdict/raw output.
- `users.avatarId` — current avatar pointer (null = letter-circle fallback).

## API

| route | auth | behavior |
| --- | --- | --- |
| `GET /api/users/:username/avatar` | none | 256px png, ETag + 5min cache; 404 when unassigned |
| `GET /api/avatars/:id/image` | none | any ready avatar by id (candidate previews), immutable cache |
| `GET /api/users/me/avatar/status` | user | `{ avatarId, nextGenerateAt, poolCount }` — profile-page bootstrap |
| `GET /api/avatars/available` | user | random sample (≤60) of the unused pool + total; selection is free/unlimited |
| `POST /api/users/me/avatar/generate` | user | optional raw `image/*` body (≤8mb) as seed; face ⇒ seeded prompt, else random; returns 4 candidates, first auto-assigned; **one generation per day** (durable via `avatarbatches.requestedBy`; failed calls don't consume it; 429 carries `retryAt`); 503 unconfigured, 502 provider failure |
| `POST /api/users/me/avatar/select` | user | `{ avatarId }` — claim a specific ready+unassigned avatar (candidate flow); 409 if taken |
| `POST /api/users/me/avatar/assign` | user | claim random unused pool avatar; 404 empty pool |
| `DELETE /api/users/me/avatar` | user | release current avatar back to pool |
| `POST /api/admin/avatars/batch` | admin | `{ count: 1..40 }` avatars, rounded up to whole grids, sequential calls |

## Commands

```bash
npm run avatars:smoke                      # one real grid (4 avatars), sanity output
npm run avatars:seed-batch -- --count 20   # fill the pool (5 grid calls ≈ $0.45)
npm run avatars:backfill:dry-run           # users without avatars vs pool size
npm run avatars:backfill                   # assign pool avatars to all users lacking one
npm run migrate:up                         # avatar-init migration (indexes only)
```

Rollout order: migrate → seed-batch (pool ≥ user count) → backfill.

## Prompts

All templates in `app/api/services/avatar-prompts.ts`, versioned ids
(`duplicant-grid-v3`, `face-duplicant-grid-v3`) persisted per avatar/batch.
Every prompt anchors on the two attached reference sheets ("drawn by the same
artist") and demands four clearly different characters per grid; variation
axes (hair, expression, hat) are injected per call. Hat rule: exactly one of
the four characters is bare-headed, the other three wear different hats — the
per-character hat briefs mostly name hats that appear on the hats sheet
(exact copies or close riffs) with a couple of "invent your own in this
style" entries mixed in. Attachment order is [style sheet, hats sheet(,
photo)] and prompts refer to slots positionally, so generation fails closed
if either sheet is missing. To update the style or hat set, replace the jpegs
in `assets/avatar-reference/` (keep them ~1024–2048px jpeg; full-res masters
live outside the repo).

## Frontend

Profile page (`/profile/:username`, "My Profile" in the user menu) shows the
avatar (immutable `/api/avatars/:id/image` url from `ProfileResponse.avatarId`,
letter-circle fallback) and, on the own profile, a "Change avatar" panel:
generate (optional photo upload, 1/day, disabled with unlock time) → pick from
the four candidates, or pick any unused pool avatar for free.

## TODO / deferred

- `user-badge` component to surface avatars site-wide (cards, comments,
  follower lists) — spec/social/avatars-identity.md.
- Refill + generation should move to a job queue if the API gets replicas.
- Batch-tier pricing (half cost) is available via the provider's batch API —
  worth it if seed batches grow into the hundreds.
- Consider purging `failed` avatar rows periodically (tiny, but unbounded).
