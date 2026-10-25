# Hosting runbook — blueprintnotincluded.org on Hetzner

One Hetzner Cloud CX23 (2 vCPU, 4 GB, 40 GB NVMe, Ubuntu 26.04) runs two Docker Compose
projects from this directory: **production** (image tag `:prod`, nightly backups to
Cloudflare R2) and **staging** (image tag `:latest`, no backups). Each project has its own
app container, its own MongoDB 8.2 with a named volume, and its own Cloudflare Tunnel. The
server publishes no port but SSH; Cloudflare's zone for the domain is in front for DNS and
TLS, and is where any caching, WAF or rate-limit rule goes (the "Cloudflare" section is what
that zone must contain). Images come from `ghcr.io/blueprintnotincluded/blueprintnotincluded`.

```
/srv/bpni/
  deploy/        this directory, rsynced by the workflows (never edit on the box)
  production/    .env (compose-level: tag, passwords, tunnel token, R2) + app.env (the app's env)
  staging/       same two files, staging values
  dumps/         scratch for seed archives and env backups; the backup image mounts it as /dumps
```

Everything below is run as the `deploy` user on the box unless it says otherwise.
`bin/compose.sh <project> …` is `docker compose` for that project. Everything that is not a
secret is in this directory; the secrets are the four env files, which `bin/env-backup.sh`
keeps as an encrypted archive off the box. "Rebuild from scratch" below is the test of that
claim.

## First install

Do these once, in order. Items 1–4 are console work; 5–7 are on the box.

### 1. Hetzner server

- Create a **CX23** (x86, shared vCPU), **Ubuntu 26.04**, in whichever of fsn1, nbg1 or hel1
  has stock; Cloudflare fronts every visitor, so the city barely matters. Leave IPv4 + IPv6
  on, no private network, no volume, no placement group. Ubuntu 26.04 and not 24.04 on
  purpose: its kernel is the 7.0 line, which `mongo:8.0.x` refuses (SERVER-121912) and
  `mongo:8.2.12` runs on — the same pairing the dev container and CI already use.
- Laptop: `deploy/bin/cloud-init-render.sh` fills `cloud-init.yaml` with your SSH public key
  and the GitHub Actions deploy key (`~/.ssh/bpni-deploy`, generated when missing; its
  private half is the `DEPLOY_SSH_KEY` repository secret) and copies the result to the
  clipboard. Paste it into the **Cloud config** box. In Hetzner's SSH key picker add your
  own key, not the deploy key.
- Attach a **Cloud Firewall**: inbound TCP 22 from anywhere (optionally ICMP), nothing else.
  Outbound open.
- Enable **Backups** (weekly server images, 20 % of the server price). They restore the
  whole box — env files, tunnel tokens, docker state — and complement the R2 database
  dumps, which are the day-to-day restore path.
- Wait for cloud-init to finish (`ssh deploy@<ip> cloud-init status --wait`), then check
  `docker compose version` and `sudo fail2ban-client status sshd`.

### 2. Cloudflare

The zone `blueprintnotincluded.org` lives in the Cloudflare account that also holds
`sinetheta.ca` (nameservers `duke.ns.cloudflare.com` / `norah.ns.cloudflare.com` at
Namecheap since 2026-10-24). This is what it must contain; the console is checked against
this table, not the other way round. After any record change, export the zone
(**DNS → Records → Export**) and commit the file as `deploy/cloudflare/blueprintnotincluded.org.zone`
so the record set has a history.

| Type | Name | Content | Proxy |
|---|---|---|---|
| CNAME | `@` (apex) | tunnel **bpni-production** (`<tunnel id>.cfargotunnel.com`) | Proxied |
| CNAME | `www` | tunnel **bpni-production** | Proxied |
| CNAME | `staging` | tunnel **bpni-staging** | Proxied |
| CNAME | `status` | `clownfish-app-8xbp6.ondigitalocean.app` | DNS only — dies with the DigitalOcean app |
| CNAME | `s1._domainkey`, `s2._domainkey` | `s1.domainkey.u1671653.wl154.sendgrid.net`, `s2.…` | DNS only — SendGrid DKIM, dormant (mail is Mailjet) |
| TXT | `@` | `v=spf1 include:spf.mailjet.com include:spf.privateemail.com ~all` | — |
| TXT | `_dmarc` | `v=DMARC1; p=none;` | — |

No `A`/`AAAA` (the apex *is* the tunnel), no `MX`. Settings: **SSL/TLS → Edge
Certificates → Always Use HTTPS: On**; Universal SSL covers the apex and
`*.blueprintnotincluded.org`. No cache, WAF or rate-limit rules exist yet (the free plan
allows one rate-limiting rule); when one is added it goes on the zone or the apex hostname,
never on an origin, and gets a row here.

**Tunnels** (Zero Trust → Networks → Tunnels, connector type Cloudflared). Each project
runs its own, because the route target `app:3000` is the compose service name on that
project's network. The token from the tunnel's *Configure* page is `TUNNEL_TOKEN` in the
project's `.env`; compose runs the connector, never the `docker run` snippet by hand.

| Tunnel | Published application routes | Service |
|---|---|---|
| bpni-production | `blueprintnotincluded.org`, `www.blueprintnotincluded.org` (plus the trial's `hetzner.blueprintnotincluded.org` until the decommission) | `http://app:3000` |
| bpni-staging | `staging.blueprintnotincluded.org` | `http://app:3000` |

Adding a route creates the proxied CNAME above; Cloudflare refuses a route whose hostname
already has a DNS record, so an existing record is deleted first. A tunnel recreated from
scratch has a new id and token: put the token in `.env`, `bin/compose.sh <project> up -d
cloudflared`, add the routes again. The server's IP appears nowhere in DNS — a rebuilt box
with the same tokens serves the same hostnames with no DNS change.

### 3. Cloudflare R2

Create bucket **bpni-backups** (any location). Create an **R2 API token** scoped to that
bucket with *Object Read & Write*; keep the Access Key ID, Secret Access Key and the
endpoint `https://<account id>.r2.cloudflarestorage.com`. Free tier: 10 GB stored, no
egress fees; the nightly archives are a few hundred MB each because `previewimages` is
excluded (see Backups).

### 4. GitHub

Repository → Settings:

- Secret **`DEPLOY_SSH_KEY`**: the contents of `~/.ssh/bpni-deploy` (the private key).
- Variable **`DEPLOY_HOST`**: the server's IPv4.
- Variable **`DEPLOY_KNOWN_HOSTS`**: the output of `ssh-keyscan -t ed25519 <ip>`.
- Environments `staging` and `production`; `production` has a required reviewer (the
  approval step of *Promote to production*).
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

### 5. Env files on the box

The first box has never received a workflow push, so copy this directory by hand from a
checkout — Laptop: `rsync -az deploy/ deploy@<ip>:/srv/bpni/deploy/`. Then on the box:

```bash
sudo -u deploy -i
/srv/bpni/deploy/bin/env-bootstrap.sh
```

It creates the four files (mode 600) from `env/*.example` with the Mongo passwords,
staging's `JWT_SECRET` and the hostnames filled in, and lists what is left for you:
the two tunnel tokens, the R2 credentials, production's `JWT_SECRET` (the value the site
already uses — a new one logs every user out), Mailjet and WorkOS keys, the optional
Gemini/Translate keys for production only. Edit with `nano`; `DB_URI` and `AUTH_MODE` stay
out (compose sets the first, the second must remain unset).

When the files exist and have been checked once, take the encrypted copy and move it off
the box (passphrase in your password manager, archive next to it or on the laptop):

```bash
/srv/bpni/deploy/bin/env-backup.sh backup     # prints the scp line
```

A rebuilt box skips the hand-filling: `bin/env-backup.sh restore <archive>` recreates the
four files from that copy (see "Rebuild from scratch").

### 6. First deploy

```bash
/srv/bpni/deploy/bin/deploy.sh staging      # pulls :latest, builds the backup image, waits for health
/srv/bpni/deploy/bin/deploy.sh production   # pulls :prod
```

`:prod` exists only after one run of the *Promote to production* workflow. On a brand-new
registry run it once (it retags `:latest` → `:prod` and deploys), or set `IMAGE_TAG=latest`
in production's `.env` for the first deploy and put `prod` back afterwards. Both projects
now answer on their hostnames with an **empty database**.

### 7. Data

Production: "Restore last night's data" below (from R2), or "Seed from a dump" from another
cluster. Staging: `bin/seed-from-dump.sh production dump local`, then
`bin/seed-from-dump.sh staging restore <archive>`. Then `migrate:status` in each project.

## Everyday operations

| What | How |
|---|---|
| Deploy staging | Merge to master. `publish.yml` builds, smoke-tests, pushes `:latest` and `:sha-<short>`, then runs `deploy.sh staging` over SSH. |
| Deploy production | Actions → *Promote to production* → `promote`. Retags `:latest` → `:prod` (old `:prod` → `:prod-previous`) and runs `deploy.sh production`. Needs the environment approval. |
| Roll production back | Same workflow with `rollback`: swaps `:prod` and `:prod-previous`, redeploys. A second rollback goes forward again. |
| Roll back to an older build | On the box: set `IMAGE_TAG=sha-<short>` in `/srv/bpni/production/.env`, run `deploy.sh production`; put `prod` back afterwards. |
| Redeploy by hand | `bin/deploy.sh <project>` — idempotent. |
| Status | `bin/compose.sh production ps`, `docker stats --no-stream` |
| Logs | `bin/compose.sh production logs -f --tail 200 app` (json-file, 10 MB × 3 per container). The `memory-heartbeat` and `facets-slow` lines the code emits are grepped here. Ctrl-C ends the follow; the containers keep running. |
| Shell in the app | `bin/compose.sh production exec app bash` (cwd `/bpni/build`) |
| Mongo shell | `bin/compose.sh production exec mongo mongosh -u root -p "$(grep MONGO_ROOT_PASSWORD= /srv/bpni/production/.env \| cut -d= -f2)" --authenticationDatabase admin blueprintnotincluded` |
| Change `app.env` (HOST, keys…) | Edit, then `bin/compose.sh <project> up -d app`. `start`/`restart` keep the container's old environment. |
| Change a memory limit | Edit `APP_MEM_LIMIT` / `MONGO_MEM_LIMIT` / `MONGO_CACHE_GB` in `.env`, `deploy.sh`. |
| Rotate the tunnel token | New token in `.env`, `bin/compose.sh <project> up -d cloudflared`. |
| After any env change | `bin/env-backup.sh backup`, copy the archive off the box; the old archive can be deleted. |
| OS updates | unattended-upgrades nightly; reboots at 05:17 UTC only when a kernel needs it; every container has `restart: unless-stopped`, Docker starts at boot, so nothing needs a login. |
| Disk | `df -h /`; `/srv/bpni/dumps` holds seed archives and env backups — delete what is no longer needed. |

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

### Restore last night's data

Into production, from the newest R2 archive. The site serves the old data until the
restore lands; the app is stopped for the restore itself (a few minutes), not for the
download.

```bash
bin/compose.sh production --profile backup run --rm --no-deps -T backup rclone lsf r2:bpni-backups/bpni-production/daily/
bin/compose.sh production --profile backup run --rm --no-deps -T backup rclone copy r2:bpni-backups/bpni-production/daily/<archive> /dumps/
bin/compose.sh production stop app
bin/seed-from-dump.sh production restore <archive>
bin/compose.sh production up -d app
bin/compose.sh production exec app npm run migrate:status
```

Previews come up cold (`previewimages` is excluded from the nightly archive) and re-render
as pages are viewed, or all at once with `npm run backfill-previews` (Batch tasks).

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
`all` stops before touching the database when the dump fails.

```bash
# From another cluster's URI. Type it into the environment rather than the command line;
# several GB, so run it in tmux. Dump while the app still serves, stop only for the restore.
read -rs SEED_SOURCE_URI && export SEED_SOURCE_URI
bin/seed-from-dump.sh production dump env          # prints the archive name
bin/compose.sh production stop app
bin/seed-from-dump.sh production restore <archive>
bin/compose.sh production up -d app

# Refresh staging from production on the same box, through /srv/bpni/dumps
bin/seed-from-dump.sh production dump local
bin/seed-from-dump.sh staging restore <archive>
```

Then `migrate:status` / `migrate:up` in that project. `read -rs` takes the next line typed
or pasted: paste the URI on its own, after the prompt, never as part of a larger paste.

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

## Rebuild from scratch

The box is gone (or the drill pretends it is). Nothing on it was unique: the stack is this
directory, the secrets are the env-backup archive, the data is last night's R2 dump, and
DNS points at tunnels, not at the server. Expect well under an hour; the mongorestore is
most of it.

1. **Laptop**: `deploy/bin/cloud-init-render.sh`, create the server (First install 1). Note
   the new IPv4.
2. **GitHub** → Settings → Variables: `DEPLOY_HOST` = the new IPv4, `DEPLOY_KNOWN_HOSTS` =
   `ssh-keyscan -t ed25519 <ip>`. Cloudflare needs nothing.
3. **Laptop**: `rsync -az deploy/ deploy@<ip>:/srv/bpni/deploy/` and
   `scp env-<stamp>.tar.enc deploy@<ip>:/srv/bpni/dumps/`.
4. **Server**: `bin/env-backup.sh restore /srv/bpni/dumps/env-<stamp>.tar.enc`. Without the
   archive: `bin/env-bootstrap.sh` and fill in by hand — tunnel tokens from Zero Trust →
   Tunnels → *Configure*, a new R2 token, Mailjet and WorkOS keys from their dashboards,
   production's `JWT_SECRET` from the password manager.
5. **Server**: database first, nothing public yet — the restored env carries the live
   tunnel token, so the app and the tunnel stay down until the data is back:
   `bin/compose.sh production pull --ignore-buildable`,
   `bin/compose.sh production --profile backup build backup`,
   `bin/compose.sh production up -d mongo`.
6. **Server**: "Restore last night's data" into production, minus its `stop app` / `up -d
   app` lines (nothing is running yet). Then `bin/deploy.sh production`: app and tunnel come
   up on the restored data and the hostname goes live.
7. **Server**: `bin/deploy.sh staging`, then staging from production with `dump local` /
   `restore` (staging may serve an empty database for those minutes).
8. Log in, open the editor, `bin/compose.sh production logs -f --tail 100 app` for a few
   minutes. Previews re-render on view.

**Drill** (do it once, and after any change to this directory that touches more than one
file): a throwaway CX23, a temporary tunnel `bpni-drill` with the route
`drill.blueprintnotincluded.org`, and steps 1, 3–6 and 8 with a stopwatch, production only —
except that step 4 uses `PRODUCTION_HOSTNAME=drill.blueprintnotincluded.org
bin/env-bootstrap.sh` with the drill tunnel's token, **not** the env archive: its tokens are
the live ones, and a second connector on `bpni-production` or `bpni-staging` would serve the
real hostnames from the drill box. Staging is skipped (its `TUNNEL_TOKEN` stays empty).
Afterwards destroy the server, the tunnel and its CNAME. Whatever slowed the drill down is a
change to this file.

## Cut-over record (2026-10-25)

DigitalOcean → Hetzner, build `d47261f`. Final dump 23:41 UTC, apex and `www` routes added
00:26 UTC. Every public blueprint compared equal between the two databases afterwards; the
only writes made on DO in the window were view and download counters. Rollback until the
decommission below, in Cloudflare DNS: delete the apex and `www` CNAMEs, re-add
`A 162.159.140.98`, `A 172.66.0.96`, `AAAA 2606:4700:7::60`, `AAAA 2a06:98c1:58::60`
as DNS only (App Platform's edge). The old app stays reachable at its
`ondigitalocean.app` hostname for comparisons.

## Decommission DigitalOcean

A week after the cut-over, once Better Stack, the nightly backup log, `docker stats` and
Mailjet delivery look right:

1. DigitalOcean: destroy the App Platform app, the Managed MongoDB cluster (take a final
   manual backup first) and the Container Registry.
2. GitHub: delete the `DIGITALOCEAN_ACCESS_TOKEN` secret and the `DIGITALOCEAN_REGISTRY` /
   `IMAGE_NAME` variables.
3. Cloudflare: remove the `hetzner.blueprintnotincluded.org` route from the tunnel
   bpni-production (the trial hostname) and the `status` CNAME; export the zone and commit
   it.
4. Invoices: the next Hetzner invoice is the CX23 with IPv4 (about $7.09) plus 20 % for
   backups, about $8.50 a month, against $45–50 on DO; the DO invoice should show only the
   prorated days before destruction, then nothing.
