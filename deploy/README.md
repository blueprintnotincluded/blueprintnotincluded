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
  dumps/         env-backup archives only, until copied off the box; database archives
                 never land here (they stream to and from R2)
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
| TXT | `@` | `v=spf1 include:spf.mailjet.com include:spf.privateemail.com ~all` | — (nothing sends as the domain today: WorkOS sends auth mail from its own domain, the Mailjet code is unused; #312) |
| TXT | `_dmarc` | `v=DMARC1; p=none;` | — |

No `A`/`AAAA` (the apex *is* the tunnel), no `MX`. The 2026-11-02 export still has the
trial's `hetzner` CNAME, which goes when its tunnel route does (Decommission DigitalOcean,
step 3). Settings: **SSL/TLS → Edge Certificates → Always Use HTTPS: On**; Universal SSL
covers the apex and `*.blueprintnotincluded.org`. No cache, WAF or rate-limit rules exist
yet (the free plan allows one rate-limiting rule); when one is added it goes on the zone or
the apex hostname, never on an origin, and gets a row here.

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
endpoint `https://<account id>.r2.cloudflarestorage.com`. No egress fees; the first
10 GB stored are free and the rest is about $0.015 per GB-month. With the retention below
(14 daily + 8 weekly archives of a few hundred MB, two monthly ones with `previewimages`
at ~4.5 GB) the bucket sits around 15–20 GB, so expect a bill of a few cents.

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
the two tunnel tokens, the R2 credentials, the two Better Stack heartbeat URLs ("Backup
monitoring") and the log source's token and ingesting host ("Log shipping"), production's `JWT_SECRET` (the value the site already uses — a new one logs
every user out), Mailjet and WorkOS keys, the optional Gemini/Translate keys for production
only. Edit with `nano`; `DB_URI` and `AUTH_MODE` stay
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
cluster. Staging: `bin/seed-from-dump.sh staging clone production`. Then `migrate:status`
in each project.

## Everyday operations

| What | How |
|---|---|
| Deploy staging | Merge to master. `publish.yml` builds, smoke-tests, pushes `:latest` and `:sha-<short>`, then runs `deploy.sh staging` over SSH. |
| Deploy production | Actions → *Promote to production* → `promote`. Retags `:latest` → `:prod` (old `:prod` → `:prod-previous`) and runs `deploy.sh production`. Needs the environment approval. |
| Roll production back | Same workflow with `rollback`: swaps `:prod` and `:prod-previous`, redeploys. A second rollback goes forward again. |
| Roll back to an older build | On the box: set `IMAGE_TAG=sha-<short>` in `/srv/bpni/production/.env`, run `deploy.sh production`; put `prod` back afterwards. |
| Redeploy by hand | `bin/deploy.sh <project>` — idempotent. |
| Status | `bin/compose.sh production ps`, `docker stats --no-stream`; the week in one page: `bin/health-report.sh` (Monitoring) |
| Logs | Better Stack Live tail on the "bni vector" source, both projects, the last 3 days ("Log shipping"); on the box `bin/compose.sh production logs -f --tail 200 app` (json-file, 10 MB × 3 per container). The `access:`, `memory-heartbeat:`, `preview render` and `facets-slow` lines the code emits are grepped here (Monitoring). Ctrl-C ends the follow; the containers keep running. |
| Shell in the app | `bin/compose.sh production exec app bash` (cwd `/bpni/build`) |
| Mongo shell | `bin/compose.sh production exec mongo mongosh -u root -p "$(grep MONGO_ROOT_PASSWORD= /srv/bpni/production/.env \| cut -d= -f2)" --authenticationDatabase admin blueprintnotincluded` |
| Change `app.env` (HOST, keys…) | Edit, then `bin/compose.sh <project> up -d app`. `start`/`restart` keep the container's old environment. |
| Change a memory limit | Edit `APP_MEM_LIMIT` / `MONGO_MEM_LIMIT` / `MONGO_CACHE_GB` in `.env`, `deploy.sh`. |
| Rotate the tunnel token | New token in `.env`, `bin/compose.sh <project> up -d cloudflared`. |
| After any env change | `bin/env-backup.sh backup`, copy the archive off the box; the old archive can be deleted. |
| OS updates | unattended-upgrades nightly; reboots at 05:17 UTC only when a kernel needs it; every container has `restart: unless-stopped`, Docker starts at boot, so nothing needs a login. |
| Disk | `df -h /`. Nothing on the box is an archive: dumps stream to R2, `deploy.sh` prunes the images it replaces, container logs rotate. `/srv/bpni/dumps` holds only env-backup archives waiting to be copied off — delete them once they are. If the disk still fills, `docker system df` says which of images, volumes or build cache it is. The weekly drill (`bin/drill-weekly.sh`, Sundays) refuses to send its heartbeat while the root disk is over 85 %, so a filling disk becomes a Better Stack alert within the week rather than a full disk mid-deploy (2026-11-07). |
| Maintenance that stops the backup or the drill | Pause the heartbeat monitor in Better Stack first ("Backup monitoring"), resume it afterwards; a paused heartbeat never alerts. |

The app's preview render worker sizes itself from the container's memory limit
(`app/api/services/render-memory.ts`); at the 1 GB production limit it runs at the 384 MB
RSS ceiling. The 512 MB renderer smoke test in `publish.yml` is unchanged.

## Monitoring

What there is to look at, from the outside in. Nothing here needs an account on the box
except the log lines and the report. What alerts on its own, all by email from the free
Better Stack account `monitoring@blueprintnotincluded.org` (team BNI, kept apart from any
other Better Stack account): the two heartbeats, the HTTP monitor on `/api/health`, and the
eight log alerts under "Alerts" below. Each exists only once it is set up in the Better
Stack console as those tables describe (Uptime → Monitors and Heartbeats; Telemetry →
dashboard "bpni" → the charts' *Alerts* tabs): look there before counting on one.
Everything else has to be looked at.

| Where | What it answers | Notes |
|---|---|---|
| **Better Stack heartbeat "bpni nightly backup"** | Did last night's backup land in R2 | A dead-man's switch: `backup.sh` requests the heartbeat URL once at the end of a successful run (03:30 UTC nightly); the monitor alerts when a day and two hours pass without one, so around 05:30 UTC. Dead container, empty R2 credentials, box off, failed dump: all the same alert. Setup and what to do: "Backup monitoring" under Backups. |
| **Better Stack heartbeat "bpni weekly restore drill"** | Did the newest archive restore, and is the disk under 85 % | `bin/drill-weekly.sh` from the deploy user's crontab, Sundays 05:00 UTC, pings after a passed drill; period 7 days, grace 1 day, so an alert on a Monday morning. Log on the box: `/srv/bpni/drill-weekly.log`. |
| **HTTP monitor on `blueprintnotincluded.org`** — either UptimeRobot (public page `https://stats.uptimerobot.com/V6QANX8e9U`) or a Better Stack HTTP monitor, whichever is kept | Is the apex up; response time of `/` | HTTP check every 5 minutes (UptimeRobot: free tier, one North American region; Better Stack: free tier, pick an EU region, which is nearer the origin). A reboot that finishes inside the interval does not register (the 2026-10-31 kernel reboot at 05:17 UTC did not). `/status` on the site used to redirect to the UptimeRobot page; the `status` CNAME that did was deleted with the DigitalOcean app on 2026-11-02. |
| **Better Stack HTTP monitor "bpni api health"** on `https://blueprintnotincluded.org/api/health`, keyword `"status":"ok"`, every 3 minutes from Europe and North America | Does the origin answer, through the tunnel, with Mongo connected | Reads the health endpoint's own verdict (503 when Mongo is down), so a dead app, a dead tunnel and a dead database are all this alert. The end-to-end check the log alerts lean on. |
| **Better Stack log source "bni vector"** (Telemetry → Sources; Live tail, Explore) | Every shipped line of both projects, searchable, with the `access:` fields typed | Logs kept 3 days; the extracted metrics 30 days. Fields and what is shipped: "Log shipping" below. |
| **Better Stack dashboard "bpni"** | A week (up to 30 days) of traffic and performance without SSH: requests by status class, p50/p95 by route, countries, renders and worker exits, RSS per process, slow queries, tunnel events, backup runs | Built on the metrics the source extracts ("Dashboard" below), so it outlives the 3-day log retention. |
| **Better Stack log alerts** (eight, "Alerts" below) | 5xx, slow responses, worker crashes, API memory, Mongo slow-query bursts, a lost tunnel, a host reboot, and the logs going silent | Email only on the free plan. Production only, except the reboot alert. |
| **Cloudflare → Analytics & Logs → Traffic** | Requests, bandwidth, cache ratio, status codes, by country and path; 24 h to 30 d | The only request counts there are until the access log below is read; everything the site serves goes through this zone. |
| **Cloudflare → Analytics & Logs → Web Analytics** | Real-user page timing and Core Web Vitals by country, path and browser | Free; a zone toggle (*automatic setup* injects the beacon, no deploy). The app's CSP already allows `static.cloudflareinsights.com` and `cloudflareinsights.com`, so turning it on is console-only. When it is on, record it in the Cloudflare section above. |
| **`GET /api/health`** | The app's own view: `checks.db` (`ok`, `pingMs` to Mongo), `memory`, `uptime`, `startedAt`, `build.commit`/`time`, `preview` (`worker` up/down, `queueDepth`/`queueMax`, `inFlight`, `failedRenders`) | What the compose healthcheck polls every 30 s. `startedAt` is fixed for the life of the process: production and staging reporting the same one is a host reboot, one of them moving alone is a container restart. 503 only when Mongo is not connected. |
| **`Server-Timing: app;dur=<ms>`** on every response | Origin time, as the browser saw it | In the Network panel's *Timing* tab; subtract it from TTFB and what is left is Cloudflare plus the path to Helsinki. |
| **Container log lines** (`bin/compose.sh <project> logs app`) | Per request, per render, per process | `access: method=… route=… status=… ms=… bytes=… ray=… country=… url=…` — every API call and page view; static files and the healthcheck only when they failed or took ≥ 1 s; a request the client abandoned carries `aborted=1` and is always logged. `memory-heartbeat: <api\|preview-worker> rss=…` every 5 minutes. `preview render <id> … total=…ms` per master render, `preview render worker exited` per recycle or crash, `facets-slow` for the facet query. Docker's rotation keeps roughly the last 30 MB per container: read them before they scroll, or let the report below do it. |
| **`bin/health-report.sh [production\|staging\|all] [--since 7d]`** | The week on one page | Host (reboots, `reboot-required`, kernel OOM kills, memory, disk), containers (status, health, restart counters, `docker stats`), then per project: boots, memory-heartbeat trend per process, the access lines summarised (status classes, p50/p95, busiest routes, countries, slowest five, 5xx), preview renders (count, cold, p50/max, queue sheds, worker exits), error lines, Mongo slow queries by namespace, cloudflared reconnects, and production's backup runs with the bucket total. Each section starts with `covers: from <timestamp>`: `compose logs` reads the container that exists now, so a deploy inside the window shortens the data to the time since it. Run it as `deploy` before the weekly look, keep the output next to last week's. The offline fallback: it needs nothing but the box, so it still answers when Better Stack is down, over quota or past its retention. |

Grep recipes, for when the report is not enough:

```bash
# slowest requests this week, with route and country
bin/compose.sh production logs --since 168h app | grep ' access: ' | awk '{ for (i = 1; i <= NF; i++) if ($i ~ /^ms=/) print substr($i, 4), $0 }' | sort -n | tail
# every boot and worker exit, timestamped
bin/compose.sh production logs -t --since 168h app | grep -E 'listening on port|worker exited'
# Mongo's own slow-query lines (over its 100 ms default)
bin/compose.sh production logs --since 168h mongo | grep 'Slow query' | grep -o '"ns":"[^"]*"' | sort | uniq -c
```

**The reboot window.** unattended-upgrades reboots the box at 05:17 UTC on the night a kernel
update lands (`cloud-init.yaml`); every container returns on its restart policy, the app
answers once mongo is healthy, and the tunnel reconnects after that — a minute or two
in which the site is down. Nothing notifies: the only trace is `last -x reboot` on the box
and both projects' `startedAt` moving together, both of which the report prints. A
monitor that polls every 5 minutes from one region will usually miss it. The weekly drill
starts at 05:00 UTC on Sundays and takes a few minutes (longer on a first Sunday, when it
also restores the 4.5 GB monthly archive); a Sunday that is also a kernel-reboot night can
cut it off at 05:17, in which case no heartbeat is sent and Better Stack alerts on Monday.
Rerun `bin/drill-weekly.sh` by hand and the alert resolves; if it happens twice, move the
crontab hour in `deploy.sh`.

### Log shipping

`vector` (pinned `timberio/vector`, 128 MB limit) ships the box's container logs to one
Better Stack Telemetry source in the BNI team (platform Vector, US region: the free plan
offers no EU one). It runs in the production project only, in the `logs` profile that
`bin/compose.sh` turns on when `BETTERSTACK_SOURCE_TOKEN` is set in production's `.env`,
and reads **both** projects' containers through the Docker socket, so staging has no
token (`compose.sh` would not start a second shipper from staging anyway). The json-file
logs are untouched: `compose logs` and `health-report.sh` read what they always did, and
are the fallback when Better Stack is down, over its quota, or past its 3-day retention.

The config is `vector/vector.yaml`, unit-tested by `vector/tests.yaml` (`vector test`,
run in the pinned image by `__tests__/deploy/scripts.test.ts` wherever docker exists,
CI included). It reaches the box with the rest of `deploy/`; the container carries a
hash of it as a label, so the next `deploy.sh production` (or `bin/compose.sh production
up -d vector`) recreates it with a changed config.

Every event has `dt`, `project` (`production` / `staging`), `service` (`app`, `mongo`,
`cloudflared`, `backup`), `kind` and the original line as `message`. By `kind`:

| `kind` | From | Extra fields |
|---|---|---|
| `access` | the app's `access:` line | `method`, `route`, `status` (number), `status_class` (`2xx`…`5xx`), `ms`, `bytes` (number or null), `country`, `ray`, `url`, `aborted` (bool) |
| `memory` | `memory-heartbeat:`, every 5 min per process | `process` (`api` / `preview-worker`), `rss_mb`, `heap_used_mb` |
| `render` | `preview render <id> … total=…ms` | `render_ms`, `queue_wait_ms`, `cold` (bool) |
| `worker-exit` | `preview render worker exited (code=…, signal=…)` | `exit_code`, `exit_signal` (strings), `exit`: `recycle` for `code=0` with `signal=null` (the worker's routine RSS recycle), `crash` for anything else |
| `queue-full` | `render queue full` | |
| `facets-slow` | `facets-slow:` | `ms` |
| `boot` | the app's `listening on port`, mongod's `Waiting for connections` | app only: `container_age_s`, seconds from the container's creation to the boot (about 0 after a deploy, which recreates it; large when an existing container started again) |
| `slow-query` | mongod `Slow query` (over its 100 ms default) | `duration_ms`, `ns`, `severity`, `mongo_msg` |
| `mongo-warning` / `mongo-error` | mongod lines at severity W / E or F | `severity`, `mongo_msg` |
| `tunnel-up` / `tunnel-down` / `tunnel-error` | cloudflared `Registered` / `Unregistered tunnel connection`, other `ERR` lines | `level` |
| `backup-done` / `backup-error` | the sidecar's `backup: done` / `backup: … failed` | |
| `log` | any other app, cloudflared or backup line | |

Not shipped: mongod's other informational lines (the per-connection chatter was 95 % of
its log on 2026-11-07, about 120 MB a day across the two stacks, so Docker's 30 MB rotation
keeps only about half a day of either mongod's log and `health-report.sh`'s Mongo section
covers that much; the source keeps the slow queries for 3 days and their counts for 30), the app's
`getBlueprint<client IP>` / `uploadBlueprint…` / `deleteBlueprint…` / `rateBlueprint…`
debug lines (no IP address leaves the box), one-off `compose run` containers (the drill and
seed tooling), and Vector's own log. In the app's lines a query value named `token`,
`code`, `state`, `key`, `secret`, `password` or `email` is replaced by `redacted`, in `url`
and `message` alike (the password-reset page is `/reset-password?token=…`).

**Volume and the free tier.** Measured on 2026-11-07: production's access lines about
4 MB a day, the mongod lines kept about 2 MB a day, the rest small; shipped with their
fields, roughly 12 MB a day, 0.35 GB a month, against the free plan's 3 GB a month kept
for 3 days. Past the quota Better Stack answers `402` and the rest of the month's lines
are lost, the log-based alerts going quiet with them; Vector logs each rejected batch
(`bin/compose.sh production logs --tail 20 vector`). Volume to cut first if it ever
grows: staging's access lines, then the `url` field.

By hand, as `deploy`:

```bash
bin/compose.sh production logs --tail 20 vector   # warnings and errors only; empty is healthy
docker stats --no-stream bpni-production-vector-1
bin/compose.sh production up -d vector            # after setting or rotating the token
bin/compose.sh production --profile logs rm -sf vector   # stop shipping (after clearing the token)
```

The token and the ingesting host go into `/srv/bpni/production/.env` at a `read -rsp`
prompt, never on a command line; then `bin/env-backup.sh backup`.

### Dashboard

The source "bni vector" extracts these metrics from the shipped events (Telemetry →
Sources → bni vector → *Extract metrics*), kept 30 days where the logs are kept 3:

| Metric | Value, from events of `kind` | Aggregations | Labels |
|---|---|---|---|
| `bpni_http_ms` | `ms` of `access` | Count, Avg, Max, Histogram | `project`, `status_class`, `route`, `aborted` |
| `bpni_http_country` | 1 per `access` | Count | `project`, `country` |
| `bpni_rss_mb` | `rss_mb` of `memory` | Max, Avg | `project`, `process` |
| `bpni_render_ms` | `render_ms` of `render` | Count, Avg, Max, Histogram | `project`, `cold` |
| `bpni_events` | 1 per `boot`, `worker-exit`, `queue-full`, `facets-slow`, `slow-query`, `mongo-error`, `tunnel-*`, `backup-*`, `memory` | Count | `project`, `service`, `kind`, `exit` (the event's own field: `recycle` / `crash` on a worker exit, empty otherwise) |

The dashboard "bpni" has a `project` variable (production by default) and one chart per
question: requests per hour by status class, 5xx by route, p50 and p95 latency by route,
requests by country, preview renders per hour (cold and warm) with their p95, worker
exits by `exit`, RSS per process against the 1024 MB app limit, slow queries per hour,
tunnel registrations and drops, backup runs per day. Mongo's warning lines are not on it:
every mongod start logs about six (memory allocator, swappiness, file descriptors) and the
search-query upsert logs a `DuplicateKey` one now and then, none of them news.

### Alerts

Few on purpose: each is something to act on, and an alert that fires on a healthy day
gets its threshold raised rather than learned to be ignored. All are charts' alerts in
Better Stack, emailing the BNI team; production only unless the row says otherwise. The
thresholds come from the logs of 2026-11-07: about 1 000 logged requests an hour, 25 Mongo
slow queries an hour, the API process at 230 MB.

| Alert | Fires when | Why that threshold | Look first |
|---|---|---|---|
| **bpni 5xx** | 10 or more 5xx responses in 15 minutes (checked every 5 minutes, recovers after 15 quiet minutes) | A quarter-hour is ~250 logged requests and a healthy one has none or a stray one; 10 is ~4 % and more than one bad crawler. A count, not a rate, so a quiet night with two errors stays quiet. | The dashboard's 5xx-by-route chart; the 5xx lines in Explore (`status_class` = `5xx`); `/api/health` (a 503 there is Mongo). |
| **bpni slow responses** | p95 of `ms` over 15 minutes above 2 000 ms, preview image routes and aborted requests (`aborted` label true) left out, held for 30 minutes | Renders take a second or more by design, so they are excluded; the API answers in tens of ms. Two seconds for 45 minutes of windows is a site that feels broken, not one slow request. | Latency by route; Mongo slow queries; `docker stats` and `free -m` for swap. |
| **bpni preview worker crashing** | 3 or more worker exits that are not the routine recycle (`code=0`, no signal) in an hour | One crash on a pathological blueprint happens; three in an hour is a loop or memory pressure (`SIGKILL` is the cgroup's OOM kill). Recycles are normal and not counted. | `bin/compose.sh production logs app \| grep -B5 'worker exited'`; the RSS chart. |
| **bpni api memory high** | The `api` process's RSS at 600 MB or more for 10 minutes (two heartbeats) | The app container's limit is 1024 MB and the render worker sizes itself up to 384 MB of it: 600 + 384 leaves about 40 MB before the kernel kills the container. | The RSS chart (a climb is a leak, a step is a load); a `deploy.sh production` restart is the stopgap. |
| **bpni mongo slow-query burst** | 60 or more slow queries in 15 minutes | Baseline is about 6 per 15 minutes; ten times that is a missing index, a pathological query or Mongo short of memory. | `bin/health-report.sh production --since 1d` (slow queries by namespace); a deploy or migration just before. |
| **bpni tunnel lost** | Over the last hour, cloudflared logged at least 2 more connection drops than registrations, for 5 minutes | A reconnect logs a drop and a registration, a restart only registrations; a surplus of drops is connections that did not come back. The logs carry events, not the tunnel's current state, so this alert names the cause in the first hour and resolves once the drops leave its window even if the tunnel is still down: "bpni api health" is what stays red for as long as the site is unreachable. | `bin/compose.sh production logs --tail 50 cloudflared`; Zero Trust → Networks → Tunnels. |
| **bpni host reboot** (both projects) | App boot lines with `container_age_s` over 300 from production *and* staging within 10 minutes | A deploy recreates the container, so its boot is about 0 s old and is not counted, however close a staging deploy and a promote come; an existing container starting again in both projects at once is the box rebooting (unattended-upgrades at 05:17 UTC, or anything else) or Docker restarting. The app boots only after Mongo is healthy, by which time Vector, which waits on nothing, is normally already reading. News, not an emergency. | `last -x reboot`, `/var/run/reboot-required`, the report's host section; that the drill or backup was not cut off. |
| **bpni logs silent** | No `memory` events from production in 30 minutes | The app writes one per process every 5 minutes. None means the app, the box or the shipper is down, and every other log alert above is blind until it is fixed. | "bpni api health" first: up means the shipper (`bin/compose.sh production ps vector`, `logs vector`; a `402` there is the free quota). |

Pause an alert, like a heartbeat, before maintenance that would trip it.

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
at 03:30 UTC. `mongodump --gzip --archive` writes to stdout and `rclone rcat` streams it
into the bucket, so no archive is ever written to the box's disk — the server is not an
archive store; R2 is. Under `r2:bpni-backups/`:

| Prefix | What | Kept |
|---|---|---|
| `bpni-production/daily/` | every night, `blueprintnotincluded` **excluding `previewimages`** | 14 days |
| `bpni-production/weekly/` | Sundays, a server-side copy of that night's daily | 8 weeks |
| `bpni-production/monthly/` | first Sunday of the month, a second dump with **every** collection (~4.5 GB) | 62 days, so two |
| `seeds/` | ad-hoc archives written by `bin/seed-from-dump.sh dump` | 30 days |
| `incoming/` | uploads in progress; moved to their prefix once mongodump exits cleanly | 1 day |

A dump that fails part-way is deleted from `incoming/` before the run fails (rclone sees
end-of-stream, not an error, so the object would otherwise look complete), and the move
into `daily/` or `seeds/` happens only after a clean exit, so `restore latest` can never
pick a partial archive. A night whose dump failed prunes nothing. The run logs each
archive's size and the bucket total; `bin/compose.sh production logs backup` shows the
last runs. Retention: `BACKUP_KEEP_{DAILY,WEEKLY,MONTHLY,SEED}_DAYS` in `.env`.

`previewimages` is the rendered-preview cache: about 3 GB of WebP (three variants, roughly
600 KB per blueprint) that the app rebuilds on request, and that would multiply the bucket
by ten if every nightly carried it. A daily restore therefore comes up with cold previews;
they re-render as pages are viewed, or all at once with `npm run backfill-previews`
(below). The monthly archive has them, for a rebuild that should come up warm. Moving that
collection out of Mongo into R2 is a separate, later change; until then the exclusion is
the trade-off.

Hetzner's weekly server backup is the second line: it captures the whole box including
the Mongo volumes (crash-consistent, up to a week old).

#### Backup monitoring

From 2026-10-25 to 2026-11-07 the R2 credentials in production's `.env` were empty, every
nightly failed at the upload, and nothing said so: the output went to the container log and
to a weekly report nobody ran. Two Better Stack heartbeats (free tier) now watch for the
opposite of a failure, a success that stops arriving, so a dead container, empty
credentials, a failed dump or a box that is off all read the same way.

| Heartbeat | Pinged by | When | Period / grace | Alert means |
|---|---|---|---|---|
| **bpni nightly backup** (`BACKUP_HEARTBEAT_URL`) | `backup/backup.sh`, inside the sidecar | Nightly at 03:30 UTC, at the very end of the run: after the daily archive is moved into `daily/`, after the Sunday `weekly/` copy and first-Sunday `monthly/` dump, after the pruning | 1 day / 2 h, so an alert at about 05:30 UTC | Last night's run did not finish. `bin/compose.sh production logs --tail 50 backup` says where it stopped. |
| **bpni weekly restore drill** (`DRILL_HEARTBEAT_URL`) | `bin/drill-weekly.sh`, from the deploy user's crontab | Sundays at 05:00 UTC | 7 days / 1 day, so an alert on Monday | The newest daily (and on a first Sunday, monthly) archive did not restore within tolerance, or the root disk is over 85 %, or the box never ran the job. `/srv/bpni/drill-weekly.log` has the run. |

Both URLs live in `/srv/bpni/production/.env`, so the env-backup archive carries them and a
rebuilt box pings the same monitors. Compose passes the first into the `backup` service;
the wrapper reads the second from the file. Either left empty means no ping and nothing
else changes, which is what staging and the tests want. A ping that fails (`curl -fsS -m 10
--retry 3`) is a line on stderr, never a failed backup or drill.

The drill wrapper runs `bin/restore-drill.sh production` (newest `daily/`), on the first
Sunday of the month also `bin/restore-drill.sh production monthly` with
`DRILL_MONTHLY_TOLERANCE_PERCENT` (default 20, since that archive is a month old if the
morning's dump failed), then `df /` against `DRILL_DISK_MAX_PERCENT` (default 85), and
pings only when all of it passed. Output is appended to `/srv/bpni/drill-weekly.log`, kept
to its last 2000 lines; the box is not an archive. By hand, as `deploy`:

```bash
bin/drill-weekly.sh                 # prints to the terminal and the log; exit 0 = pinged
tail -n 60 /srv/bpni/drill-weekly.log
crontab -l                          # the line deploy.sh production installs
```

`deploy.sh production` installs the crontab line (`0 5 * * 0 …/drill-weekly.sh # bpni
drill-weekly`) on every run, replacing its own earlier line and leaving any other, so a
rebuilt box gets it with its first deploy. The drill is not tied to deploys otherwise:
deploys change the app, not the backup path. Keep the habit of running `bin/restore-drill.sh`
by hand after any change to `backup/`.

Memory: the throwaway mongo runs under a 768 MB limit with a 256 MB WiredTiger cache, on a
4 GB box that already runs two stacks, which is why the drill is scheduled in the quiet
hour. Each drill prints `== drill container usage` (its `docker stats`) before teardown;
the first hand run on 2026-11-07 passed under live load in about two minutes. If a drill
ever OOMs, lower `--wiredTigerCacheSizeGB` in `restore-drill.sh`; do not skip the drill.

**Silencing during maintenance.** Anything that stops the sidecar or the box past the grace
window (a long migration with the stack down, a rebuild) will alert. Pause the affected
heartbeat in Better Stack first (the monitor's *Pause* button), resume it after, and
confirm with a hand run (`bin/compose.sh production exec backup backup.sh`,
`bin/drill-weekly.sh`) that the next ping arrives. The alternative, clearing the URL from
`.env`, needs `up -d backup` and a new env-backup for a temporary state; pausing is cheaper.

**Better Stack setup** (console, once): a heartbeat monitor per row above, with the name,
period and grace from the table, on an escalation policy that emails (and optionally pushes
to a phone). Each monitor shows its URL; those go into `.env` at a `read -rs` prompt, never
on a command line or in a chat, then `bin/compose.sh production up -d backup`, a hand run of
each job to turn both monitors green, and `bin/env-backup.sh backup` copied off the box.

### Restore last night's data

Into production, from the newest R2 archive. The site serves the old data until the
restore lands; the app is stopped for the restore itself (a few minutes). The archive
streams from R2 straight into mongorestore; nothing is downloaded to the box.

```bash
bin/compose.sh production stop app
bin/seed-from-dump.sh production restore latest
bin/compose.sh production up -d app
bin/compose.sh production exec app npm run migrate:status
```

`latest` is the newest `daily/` archive. Any other one goes by its bucket path:
`bin/compose.sh production --profile backup run --rm --no-deps -T backup rclone lsf
r2:bpni-backups/bpni-production/weekly/` to list, then `restore
bpni-production/weekly/<archive>` (or `monthly/`, which carries previews).

Previews come up cold from a daily or weekly archive (`previewimages` is excluded) and
re-render as pages are viewed, or all at once with `npm run backfill-previews` (Batch
tasks); a `monthly/` archive restores them warm.

### Restore drill

```bash
bin/restore-drill.sh            # production, newest daily; exit 0 = pass
bin/restore-drill.sh production monthly
```

Streams the newest archive of that kind into a throwaway `mongo:8.2.12` container on the
project's network, prints live → restored counts per collection (excluded collections
must be absent from a daily or weekly archive and present in a monthly one, every other
count within 5 % of live — `DRILL_TOLERANCE_PERCENT` widens it for a weeks-old monthly),
prints the throwaway container's `docker stats` and removes it. Nothing touches the disk.
`bin/drill-weekly.sh` runs it every Sunday with a heartbeat on success ("Backup
monitoring"); run it by hand as well after the first nightly backup, after the first
monthly one, and whenever the backup image, exclusions or retention change.

### Seed from a dump

`bin/seed-from-dump.sh <project> <dump|restore|all|clone> <uri|env|local|archive|project>`
runs mongodump / mongorestore / rclone inside the backup image, with credentials passed
through a 0600 config file rather than arguments. `dump` streams the archive to
`r2:bpni-backups/seeds/seed-<stamp>.archive.gz` (pruned after 30 days by the nightly job)
and `restore` streams it back; neither writes a file on the box. Dumps include **every**
collection (previewimages too) so a seeded site has warm previews. A restore first drops
every collection of the project's `blueprintnotincluded` database (users are kept), so
nothing stale survives it. `all` stops before touching the database when the dump fails.
`clone` pipes one project's mongodump into the other's mongorestore and stores nothing
anywhere — the staging refresh; it needs no R2 credentials, `dump`/`restore` on staging
need the `R2_*` lines in its `.env`.

```bash
# From another cluster's URI. Type it into the environment rather than the command line;
# several GB, so run it in tmux. Dump while the app still serves, stop only for the restore.
read -rs SEED_SOURCE_URI && export SEED_SOURCE_URI
bin/seed-from-dump.sh production dump env          # prints the archive name
bin/compose.sh production stop app
bin/seed-from-dump.sh production restore <archive>
bin/compose.sh production up -d app

# Refresh staging from production on the same box
bin/seed-from-dump.sh staging clone production
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
4. **Server**: `bin/env-backup.sh restore /srv/bpni/dumps/env-<stamp>.tar.enc`. The archive
   carries the two heartbeat URLs and the log source token, so the rebuilt box reports to
   the same Better Stack monitors and source. Without the archive: `bin/env-bootstrap.sh` and fill in by hand — tunnel
   tokens from Zero Trust → Tunnels → *Configure*, a new R2 token, the heartbeat URLs from
   each monitor's page in Better Stack and the source token and ingesting host from the
   log source's page, Mailjet and WorkOS keys from their dashboards,
   production's `JWT_SECRET` from the password manager.
5. **Server**: database first, nothing public yet — the restored env carries the live
   tunnel token, so the app and the tunnel stay down until the data is back:
   `bin/compose.sh production pull --ignore-buildable`,
   `bin/compose.sh production --profile backup build backup`,
   `bin/compose.sh production up -d mongo`.
6. **Server**: `bin/seed-from-dump.sh production restore latest` (last night's daily;
   `restore bpni-production/monthly/<archive>` instead for warm previews, at up to a
   month's staleness — check `rclone lsf` first). Then `bin/deploy.sh production`: app and
   tunnel come up on the restored data, the hostname goes live, and the weekly drill is
   back in the crontab (`crontab -l`).
7. **Server**: `bin/deploy.sh staging`, then `bin/seed-from-dump.sh staging clone
   production` (staging may serve an empty database for those minutes).
8. Log in, open the editor, `bin/compose.sh production logs -f --tail 100 app` for a few
   minutes. Previews re-render on view unless the monthly archive was restored. If the
   heartbeats alerted during the rebuild, `bin/compose.sh production exec backup backup.sh`
   and `bin/drill-weekly.sh` by hand turn them green again.

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

A week after the cut-over, once UptimeRobot, the nightly backup log, `bin/health-report.sh`
and Mailjet delivery look right:

1. DigitalOcean: destroy the App Platform app, the Managed MongoDB cluster (take a final
   manual backup first) and the Container Registry.
2. GitHub: delete the `DIGITALOCEAN_ACCESS_TOKEN` secret and the `DIGITALOCEAN_REGISTRY` /
   `IMAGE_NAME` variables.
3. Cloudflare: remove the `hetzner.blueprintnotincluded.org` route from the tunnel
   bpni-production (the trial hostname); export the zone and commit it. (The `status`
   CNAME and the SendGrid DKIM records were deleted on 2026-11-02.)
4. Invoices: the next Hetzner invoice is the CX23 with IPv4 (about $7.09) plus 20 % for
   backups, about $8.50 a month, against $45–50 on DO; the DO invoice should show only the
   prorated days before destruction, then nothing.
