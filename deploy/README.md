# Hosting runbook — blueprintnotincluded.org on Hetzner

One Hetzner Cloud CX23 (2 vCPU, 4 GB, 40 GB NVMe, Ubuntu 26.04) runs two Docker Compose
projects from this directory: **production** (image tag `:prod`, nightly backups to
Cloudflare R2) and **staging** (image tag `:latest`, no backups). Each project has its own
app container, its own MongoDB 8.2 with a named volume, and its own Cloudflare Tunnel. The
server publishes no port but SSH; Cloudflare stays in front for DNS, TLS, caching and rate
limiting — Kevin's own Cloudflare account, which the zone has to be moved into first (First
install 2): today the domain's DNS is hosted at DigitalOcean, and the `server: cloudflare`
header the live site returns is App Platform's edge, not a zone of ours. Images come from
`ghcr.io/blueprintnotincluded/blueprintnotincluded`.

```
/srv/bpni/
  deploy/        this directory, rsynced by the workflows (never edit on the box)
  production/    .env (compose-level: tag, passwords, tunnel token, R2) + app.env (the app's env)
  staging/       same two files, staging values
  dumps/         scratch for seed archives; the backup image mounts it as /dumps
```

Everything below is run as the `deploy` user on the box unless it says otherwise.
`bin/compose.sh <project> …` is `docker compose` for that project.

## First install

Do these once, in order. Items 1–5 are console work; the rest is on the box.

### 1. Hetzner server

- Create a **CX23** (x86, shared vCPU), **Ubuntu 26.04**, in whichever of fsn1, nbg1 or hel1
  has stock; Cloudflare fronts every visitor, so the city barely matters. Leave IPv4 + IPv6
  on, no private network, no volume, no placement group. Ubuntu 26.04 and not 24.04 on
  purpose: its kernel is the 7.0 line, which `mongo:8.0.x` refuses (SERVER-121912) and
  `mongo:8.2.12` runs on — the same pairing the dev container and CI already use.
- Generate the deploy key on your laptop: `ssh-keygen -t ed25519 -f ~/.ssh/bpni-deploy -C github-actions-deploy -N ''`.
- Copy `cloud-init.yaml` into the "Cloud config" box, replacing the two
  `ssh_authorized_keys` placeholders with your own public key and `bpni-deploy.pub`.
- Attach a **Cloud Firewall**: inbound TCP 22 from anywhere (optionally ICMP), nothing else.
  Outbound open.
- Enable **Backups** (weekly server images, 20 % of the server price). They restore the
  whole box — env files, tunnel tokens, docker state — and complement the R2 database
  dumps, which are the day-to-day restore path.
- Wait for cloud-init to finish (`ssh deploy@<ip> cloud-init status --wait`), then check
  `docker compose version` and `sudo fail2ban-client status sshd`.

### 2. Cloudflare zone

The tunnels, the trial hostname and the cut-over all need `blueprintnotincluded.org` to be a
zone in the Cloudflare account. Until this step it is not one: the registrar is Namecheap and
the nameservers are `ns1–3.digitalocean.com`, with the records in DigitalOcean's DNS. Moving
the zone changes nothing for visitors as long as every record is carried over unproxied.

1. Laptop: `doctl compute domain records list blueprintnotincluded.org` — the full record
   set to check the import against (at least the apex record pointing at the App Platform
   app, the SPF `TXT` with `spf.mailjet.com` and `spf.privateemail.com`, `_dmarc`, and any
   Mailjet or WorkOS verification `TXT`s).
2. Cloudflare dashboard → **Add a domain** → `blueprintnotincluded.org` → **Free** plan.
   Cloudflare scans and imports what it can find; add whatever the list above shows is
   missing. Set **every** record to *DNS only* (grey cloud) for now: proxying the apex would
   put our Cloudflare in front of App Platform's and break its certificate renewal. The
   proxied records arrive with the tunnels, and the apex turns orange at cut-over.
3. Namecheap → the domain → **Nameservers** → *Custom DNS* → the two
   `*.ns.cloudflare.com` names Cloudflare shows for this zone. Cloudflare marks the zone
   *Active* once it sees them (minutes to a few hours). DigitalOcean's copy of the zone can
   stay until decommissioning; it is simply no longer authoritative.

No cache, rate-limit or WAF rules exist yet (there was no zone to hold them). Add them
after cut-over, on the apex hostname.

### 3. Cloudflare Tunnel

In Zero Trust → Networks → Tunnels create two tunnels, **bpni-production** and
**bpni-staging** (Cloudflared connector type). For each, note the token shown in the
`docker run … --token …` snippet, and add one public hostname:

| Tunnel | Public hostname | Service |
|---|---|---|
| bpni-production | `hetzner.blueprintnotincluded.org` (during the trial) | `http://app:3000` |
| bpni-staging | `staging.blueprintnotincluded.org` | `http://app:3000` |

`app` is the compose service name, resolved on the project's network — the reason each
project runs its own tunnel. Cloudflare creates the proxied DNS records itself. The
production tunnel gains the apex and `www` at cut-over (below).

### 4. Cloudflare R2

Create bucket **bpni-backups** (any location). Create an **R2 API token** scoped to that
bucket with *Object Read & Write*; keep the Access Key ID, Secret Access Key and the
endpoint `https://<account id>.r2.cloudflarestorage.com`. Free tier: 10 GB stored, no
egress fees; the nightly archives are a few hundred MB each because `previewimages` is
excluded (see Backups).

### 5. GitHub

Repository → Settings:

- Secret **`DEPLOY_SSH_KEY`**: the contents of `~/.ssh/bpni-deploy` (the private key).
- Variable **`DEPLOY_HOST`**: the server's IPv4.
- Variable **`DEPLOY_KNOWN_HOSTS`**: the output of `ssh-keyscan -t ed25519 <ip>`.
- Environments `staging` and `production` already exist; `production` keeps its required
  reviewer.
- After the first `publish.yml` run, open the new package
  (`ghcr.io/blueprintnotincluded/blueprintnotincluded`) → Package settings → **Change
  visibility → Public**. ghcr.io creates packages private even for public repositories;
  until it is public the server cannot pull. (Alternative: `docker login ghcr.io` on the
  box with a classic PAT that has `read:packages`.)
- WorkOS needs no hostname change for either project (both use the Production
  environment, see `agent/WORKOS_PLAN.md`): the app calls the User Management API
  directly — password and magic-code login, emailed verification codes — and builds the
  password-reset link itself from `SITE_URL`, so no WorkOS redirect, sign-in or logout URL
  setting is involved. Only the three env values (`WORKOS_API_KEY`, `WORKOS_CLIENT_ID`,
  `WORKOS_PLATFORM_ORG_ID`) are copied into `app.env`.

### 6. Env files on the box

```bash
sudo -u deploy -i
cp /srv/bpni/deploy/env/production.env.example /srv/bpni/production/.env
cp /srv/bpni/deploy/env/app.env.example        /srv/bpni/production/app.env
cp /srv/bpni/deploy/env/staging.env.example    /srv/bpni/staging/.env
cp /srv/bpni/deploy/env/app.env.example        /srv/bpni/staging/app.env
chmod 600 /srv/bpni/*/.env /srv/bpni/*/app.env
```

Fill them in by hand. `.env` wants fresh random passwords (`openssl rand -hex 24` three
times per project), the tunnel token and the R2 credentials. `app.env` takes the values
from the DigitalOcean app's environment (Mailjet, WorkOS, Gemini, Translate), with
`HOST`/`SITE_URL` set to that project's hostname. `JWT_SECRET`: production keeps the DO
value so existing sessions survive the cut-over; staging gets its own fresh one. Never
copy `DB_URI` or `AUTH_MODE` across; compose sets the first and the second must stay
unset.

The deploy directory has not been synced yet at this point, so for the very first run
copy it by hand from a checkout: `rsync -az deploy/ deploy@<ip>:/srv/bpni/deploy/`.

### 7. First deploy

```bash
/srv/bpni/deploy/bin/deploy.sh staging      # pulls :latest, builds the backup image, waits for health
/srv/bpni/deploy/bin/deploy.sh production   # pulls :prod — exists only after one promotion…
```

`:prod` does not exist until the first run of the *Promote to production* workflow. For
the trial, run it once (it retags `:latest` → `:prod` and deploys), or temporarily set
`IMAGE_TAG=latest` in production's `.env`. Both projects now answer on their hostnames
with an **empty database**; seed them next (Database → Seed from a dump), then run the
migrations.

## Everyday operations

| What | How |
|---|---|
| Deploy staging | Merge to master. `publish.yml` builds, smoke-tests, pushes `:latest` and `:sha-<short>`, then runs `deploy.sh staging` over SSH. |
| Deploy production | Actions → *Promote to production* → `promote`. Retags `:latest` → `:prod` (old `:prod` → `:prod-previous`) and runs `deploy.sh production`. Needs the environment approval. |
| Roll production back | Same workflow with `rollback`: swaps `:prod` and `:prod-previous`, redeploys. A second rollback goes forward again. |
| Roll back to an older build | On the box: set `IMAGE_TAG=sha-<short>` in `/srv/bpni/production/.env`, run `deploy.sh production`; put `prod` back afterwards. |
| Redeploy by hand | `bin/deploy.sh <project>` — idempotent. |
| Status | `bin/compose.sh production ps`, `docker stats --no-stream` |
| Logs | `bin/compose.sh production logs -f --tail 200 app` (json-file, 10 MB × 3 per container). The `memory-heartbeat` and `facets-slow` lines the code emits are grepped here now instead of `doctl apps logs`. |
| Shell in the app | `bin/compose.sh production exec app bash` (cwd `/bpni/build`) |
| Mongo shell | `bin/compose.sh production exec mongo mongosh -u root -p "$(grep MONGO_ROOT_PASSWORD= /srv/bpni/production/.env \| cut -d= -f2)" --authenticationDatabase admin blueprintnotincluded` |
| Change a memory limit | Edit `APP_MEM_LIMIT` / `MONGO_MEM_LIMIT` / `MONGO_CACHE_GB` in `.env`, `deploy.sh`. |
| Rotate the tunnel token | New token in `.env`, `bin/compose.sh <project> up -d cloudflared`. |
| OS updates | unattended-upgrades nightly; reboots at 05:17 UTC only when a kernel needs it; containers restart on their own. |

The app's preview render worker sizes itself from the container's memory limit
(`app/api/services/render-memory.ts`); at the 1 GB production limit it runs at the 384 MB
RSS ceiling. The 512 MB renderer smoke test in `publish.yml` is unchanged.

## Database

### Migrations

Manual, after a deploy that ships one, same policy as before (`docs/migrations.md`):

```bash
bin/compose.sh production exec backup backup.sh     # ad-hoc dump to R2 first
bin/compose.sh production exec app npm run migrate:status
bin/compose.sh production exec app npm run migrate:up
```

Staging has its own database now, so a migration can be rehearsed there first
(`bin/compose.sh staging exec app npm run migrate:up`) against a recent copy of production.

### Backups

The `backup` sidecar (production only, `COMPOSE_PROFILES=backup`) runs `backup/backup.sh`
at 03:30 UTC: `mongodump --gzip --archive` of `blueprintnotincluded` **excluding
`previewimages`**, uploaded with rclone to `r2:bpni-backups/bpni-production/daily/`
(kept 14 days) and, on Sundays, `weekly/` (kept 8 weeks). The run logs the archive size and
the bucket total; `bin/compose.sh production logs backup` shows the last runs.

`previewimages` is the rendered-preview cache: about 3 GB of WebP (three variants, roughly
600 KB per blueprint) that the app rebuilds on request, and that would exhaust R2's free
10 GB in three nights. A restore therefore comes up with cold previews; they re-render as
pages are viewed, or all at once with `npm run backfill-previews` (below). Moving that
collection out of Mongo into R2 is a separate, later change; until then the exclusion is
the trade-off.

Hetzner's weekly server backup is the second line: it captures the whole box including
the Mongo volumes (crash-consistent, up to a week old).

### Restore

From an R2 archive into production (the site keeps serving the old data until the
`--drop` restore lands; stop the app first for a clean cut):

```bash
bin/compose.sh production --profile backup run --rm --no-deps -T backup rclone lsf r2:bpni-backups/bpni-production/daily/
bin/compose.sh production --profile backup run --rm --no-deps -T backup rclone copy r2:bpni-backups/bpni-production/daily/<archive> /dumps/
bin/compose.sh production stop app
bin/seed-from-dump.sh production restore <archive>
bin/compose.sh production start app
bin/compose.sh production exec app npm run migrate:status
```

Whole-box loss: restore the Hetzner backup image (or recreate from cloud-init and the
env files you kept), then the steps above.

### Restore drill

```bash
bin/restore-drill.sh            # production; exit 0 = pass
```

Fetches the newest daily archive, restores it into a throwaway `mongo:8.2.12` container on
the project's network, prints live → restored counts per collection (excluded collections
must be absent, every other count within 5 % of live), and removes the container. Run it
after the first nightly backup and whenever the backup image, exclusions or retention
change.

### Seed from a dump

`bin/seed-from-dump.sh <project> <dump|restore|all> <uri|env|local|archive>` runs
mongodump / mongorestore inside the backup image, with credentials passed through a
0600 config file rather than arguments. Dumps include **every** collection (previewimages
too) so a seeded site has warm previews. A restore first drops every collection of the
project's `blueprintnotincluded` database (users are kept), so nothing stale survives it.

```bash
# From DigitalOcean's read-only URI (the PROD_READONLY_URI in /.env.migration on the dev
# box). Type it into the environment rather than the command line; several GB, so run
# it in tmux. If it cannot connect, the cluster's "Trusted sources" need the server's
# IPv4 added in the DO console.
read -rs SEED_SOURCE_URI && export SEED_SOURCE_URI
bin/seed-from-dump.sh production all env

# Refresh staging from production on the same box, through /srv/bpni/dumps
bin/seed-from-dump.sh production dump local      # prints the archive name
bin/seed-from-dump.sh staging restore <archive>
```

Then `migrate:status` / `migrate:up` in that project.

## Batch tasks

The image is unchanged: `/bpni/build` with `package.json`, `scripts/batch.sh` and the
compiled `app/api/batch/*.js`, so every task in README "Running batch tasks in production"
runs the same way, prefixed with the compose exec:

```bash
bin/compose.sh production exec app npm run derive-metadata:dry-run -- --limit 100
bin/compose.sh production exec app npm run derive-search
bin/compose.sh production exec app npm run avatars:seed-batch -- --count 10
```

`exec` runs inside the web process's container and shares its 1 GB limit. For the heavy
preview backfill start a separate container with the same image and its own limit, so the
site is never squeezed:

```bash
bin/compose.sh production run --rm --no-deps app npm run backfill-previews
```

(`--no-deps` because mongo is already up; the service's `env_file` and `DB_URI` apply to
`run` just the same.)

## Trial plan (one-time)

Digital Ocean keeps serving `blueprintnotincluded.org` throughout. The Hetzner stack runs
on `hetzner.blueprintnotincluded.org` with a copy of the data; anything written there is
throwaway, because the cut-over does a fresh dump/restore.

1. First install above, through the first deploy of both projects.
2. Seed production from the DO read-only URI (`seed-from-dump.sh production all env`), then
   `migrate:status` (everything applied, since the dump carries the `migrations`
   collection) and compare collection counts with the DO cluster
   (`db.blueprints.estimatedDocumentCount()` etc. on both).
3. Seed staging from production (`seed-from-dump.sh production dump local`, then
   `seed-from-dump.sh staging restore <archive>`).
4. Wait for the first nightly backup, then `bin/restore-drill.sh` end to end. Check the
   bucket size in the R2 console.
5. Better Stack: add HTTP monitors from several regions (at least Singapore, US West or
   East, Frankfurt, São Paulo) for
   `https://blueprintnotincluded.org/api/health`,
   `https://hetzner.blueprintnotincluded.org/api/health`, and the two home pages, 1-minute
   interval, for at least a week. Compare response times by region and any failed checks.
6. Manual smoke test on the trial hostname: log in with WorkOS, open a blueprint, open the
   editor, save a throwaway blueprint, check its preview renders, check the Discover
   search, trigger a password-reset mail (Mailjet). Watch
   `bin/compose.sh production logs -f app` meanwhile.
7. Promote once from GitHub Actions to prove the retag + SSH path; roll back once.
8. Let it run a week. `docker stats`, the memory-heartbeat log lines and the nightly backup
   log tell you whether the limits fit.

## Cut-over checklist (one-time)

Pick a quiet hour (03:00–06:00 UTC is the traffic trough). Writes made on DO between the
final dump and the DNS change are lost, so keep the window short.

1. **Before**: note the current apex and `www` DNS records exactly (target, proxy status)
   — that is the rollback. If any cache, rate-limit or WAF rules were added since the zone
   moved, confirm they are keyed on the zone or the apex hostname, not on an origin. WorkOS
   needs nothing: login is password or an emailed code and the reset link is built from
   `SITE_URL`, so no WorkOS redirect setting names a hostname.
2. **Env diff** on the box: in `/srv/bpni/production/app.env` set
   `HOST=https://blueprintnotincluded.org` and `SITE_URL=https://blueprintnotincluded.org`;
   in `.env` set `PUBLIC_HOSTNAME=blueprintnotincluded.org`. Everything else was copied
   from DO already; `diff` the two environments one last time.
3. **Final dump/restore**: `bin/compose.sh production stop app`, then
   `bin/seed-from-dump.sh production all env` with the DO read-only URI in
   `SEED_SOURCE_URI`, then `migrate:status`. Do not start the app yet.
4. **Tunnel**: in the `bpni-production` tunnel add public hostnames
   `blueprintnotincluded.org` and `www.blueprintnotincluded.org` → `http://app:3000`.
   Cloudflare refuses to add a hostname whose DNS record already exists, so for each:
   delete the old record, add the public hostname (which creates the proxied CNAME to
   `<tunnel id>.cfargotunnel.com`). Rollback is recreating the old record from step 1 —
   proxied records change within seconds either way.
5. `bin/compose.sh production start app`; `bin/deploy.sh production` as the health check.
   Load the site, log in, open the editor.
6. **Watch for a week**: Better Stack on the apex (now the Hetzner origin), the memory
   heartbeat lines, `docker stats`, nightly backup logs, R2 bucket size, Mailjet delivery.
   DO stays live and untouched the whole week; rollback is step 4 in reverse.
7. **Decommission DO** after the week: destroy the App Platform app, the Managed MongoDB
   cluster (take a final manual backup first) and the Container Registry. Delete the
   `DIGITALOCEAN_ACCESS_TOKEN` and `DIGITALOCEAN_REGISTRY` / `IMAGE_NAME` repository
   secrets/variables. Remove the trial public hostname `hetzner.blueprintnotincluded.org`
   from the tunnel. Delete `/.env.migration` on the dev box (the read-only URI dies with
   the cluster).
8. **Invoices**: the next Hetzner invoice is the CX23 with IPv4 (about $7.09) plus 20 % for
   backups, about $8.50 a month, against $45–50 on DO; the DO invoice should show only the
   prorated days before destruction, then nothing.
