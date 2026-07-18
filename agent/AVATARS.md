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
5. Verify: `npm run avatars:smoke` — one real generation (~$0.045), stores the
   avatar in the pool and writes `avatar-smoke-test.png` (gitignored) for
   eyeballing. `npm run avatars:smoke -- --seed path/to/photo.jpg` also
   exercises the face-classification path.

## Env vars

| var | default | notes |
| --- | --- | --- |
| `GEMINI_API_KEY` | unset | unset ⇒ loud startup error, avatar endpoints 503, everything else unaffected |
| `AVATAR_IMAGE_MODEL` | `gemini-3.1-flash-image` | 512px 1:1 jpeg output (`image/jpeg` is the only accepted `response_format.mime_type`) |
| `AVATAR_CLASSIFY_MODEL` | `gemini-3.5-flash` | cheap multimodal FACE/NOT_FACE pre-check |
| `AVATAR_POOL_LOW_WATER` | `5` | refill trigger threshold (0 disables refill — tests use this) |
| `AVATAR_POOL_REFILL` | `5` | avatars generated per refill |

## Cost

- Image generation: **~$0.045 per avatar** (512px, standard tier). The API
  minimum is 512px — we asked for 256 but it doesn't exist; the original 512
  jpeg is stored verbatim and a 256px png derivative is what gets served.
- Face classification: ~1,200 tokens of `gemini-3.5-flash` per upload —
  fractions of a cent. Chosen over local face detection because proper on-box
  detection means TensorFlow/OpenCV native builds.
- Every provider call is recorded on an `avatars` row (`status: 'failed'` rows
  included) with `interactionId`, `usage`, `latencyMs` — that's the cost log.

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

- `avatars` — display png (256), original provider jpeg (512), sha256 of the
  original (unique+sparse ⇒ dedupe), prompt + template id, sourceType
  (`random` | `user-upload` | `seed-batch`), provider metadata, assignment
  state. Binaries in Mongo per the previewimages precedent (~0.5MB/row,
  covered by normal backups).
- `avatarseeduploads` — user's uploaded seed photo, re-encoded through sharp
  (validates payload, strips EXIF, caps at 1024px jpeg), plus the face
  classification verdict/raw output.
- `users.avatarId` — current avatar pointer (null = letter-circle fallback).

## API

| route | auth | behavior |
| --- | --- | --- |
| `GET /api/users/:username/avatar` | none | 256px png, ETag + 5min cache; 404 when unassigned |
| `POST /api/users/me/avatar/generate` | user | optional raw `image/*` body (≤8mb) as seed; face ⇒ seeded prompt, else random; 60s per-user cooldown; 503 unconfigured, 502 provider failure |
| `POST /api/users/me/avatar/assign` | user | claim random unused pool avatar; 404 empty pool |
| `DELETE /api/users/me/avatar` | user | release current avatar back to pool |
| `POST /api/admin/avatars/batch` | admin | `{ count: 1..20 }` sequential generations |

## Commands

```bash
npm run avatars:smoke                      # one real generation, sanity output
npm run avatars:seed-batch -- --count 20   # fill the pool (~$0.90 for 20)
npm run avatars:seed-batch -- --count 20 --reference sheet.png  # style-sheet mode
npm run avatars:backfill:dry-run           # users without avatars vs pool size
npm run avatars:backfill                   # assign pool avatars to all users lacking one
npm run migrate:up                         # avatar-init migration (indexes only)
```

Rollout order: migrate → seed-batch (pool ≥ user count) → backfill.

## Prompts

All templates in `app/api/services/avatar-prompts.ts`, versioned ids
(`random-duplicant-v1`, `face-duplicant-v1`, `seed-batch-duplicant-v1`)
persisted per avatar. Style is "inspired by" ONI duplicants (original
character, no copies); random/batch prompts draw variation axes (hair,
expression, accessory, outfit) so batches come out distinct.

## TODO / deferred

- Frontend: no UI yet — needs the `user-badge` component + profile
  generate/upload controls (spec/social/avatars-identity.md).
- Style reference sheet: `--reference` is wired; generate/upload the actual
  sheet and re-run seed batches with it.
- Refill + generation should move to a job queue if the API gets replicas.
- Batch-tier pricing (half cost) is available via the provider's batch API —
  worth it if seed batches grow into the hundreds.
- Consider purging `failed` avatar rows periodically (tiny, but unbounded).
