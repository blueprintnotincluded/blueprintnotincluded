#!/bin/bash
# Create the four env files on a fresh box from the examples in deploy/env, with
# every random secret generated in place.
#
#   env-bootstrap.sh                 # on the server, as deploy
#
# Refuses to touch a file that already exists (exit 73): a box that has env
# files keeps them. The examples come from $BPNI_ROOT/deploy/env, the directory
# publish.yml rsyncs on every master push; on a box that has never received a
# push, copy it by hand first (README, "Rebuild from scratch").
#
# Generated here: the three Mongo passwords per project, staging's JWT_SECRET,
# and the hostnames (PRODUCTION_HOSTNAME / STAGING_HOSTNAME override the
# defaults). Left empty for you, and listed at the end:
#   production/.env    TUNNEL_TOKEN, R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
#   staging/.env       TUNNEL_TOKEN (the R2_* lines are optional there)
#   production/app.env JWT_SECRET — the value the site already uses; a new one
#                      logs every user out — plus MAILJET_*, WORKOS_* and the
#                      optional GEMINI_* / GOOGLE_TRANSLATE_API_KEY
#   staging/app.env    the same Mailjet and WorkOS values; GEMINI_API_KEY and
#                      GOOGLE_TRANSLATE_API_KEY stay empty on purpose (no paid
#                      calls from staging)
# To bring a previous box's values back instead, use env-backup.sh restore.
set -euo pipefail

root=${BPNI_ROOT:-/srv/bpni}
ex=$root/deploy/env
production_host=${PRODUCTION_HOSTNAME:-blueprintnotincluded.org}
staging_host=${STAGING_HOSTNAME:-staging.blueprintnotincluded.org}
files=(production/.env production/app.env staging/.env staging/app.env)

[ -d "$ex" ] || { echo "$ex missing: has deploy/ been synced to the box?" >&2; exit 66; }
for f in "${files[@]}"; do
  [ -e "$root/$f" ] && { echo "$root/$f exists, not touching it" >&2; exit 73; }
done

mkdir -p "$root/production" "$root/staging"
install -m 600 "$ex/production.env.example" "$root/production/.env"
install -m 600 "$ex/app.env.example"        "$root/production/app.env"
install -m 600 "$ex/staging.env.example"    "$root/staging/.env"
install -m 600 "$ex/app.env.example"        "$root/staging/app.env"

# set_kv <file relative to root> <key> <value>: replace the `key=` line.
set_kv() {
  sed -i "s|^$2=.*|$2=$3|" "$root/$1"
  grep -qxF -- "$2=$3" "$root/$1" || { echo "failed to set $2 in $root/$1" >&2; exit 70; }
}

for p in production staging; do
  for k in MONGO_ROOT_PASSWORD MONGO_APP_PASSWORD MONGO_BACKUP_PASSWORD; do
    set_kv "$p/.env" "$k" "$(openssl rand -hex 24)"
  done
done
set_kv production/.env   PUBLIC_HOSTNAME "$production_host"
set_kv production/app.env HOST     "https://$production_host"
set_kv production/app.env SITE_URL "https://$production_host"
set_kv staging/.env      PUBLIC_HOSTNAME "$staging_host"
set_kv staging/app.env   HOST     "https://$staging_host"
set_kv staging/app.env   SITE_URL "https://$staging_host"
set_kv staging/app.env   JWT_SECRET "$(openssl rand -hex 32)"

echo "== created (mode 600):"
for f in "${files[@]}"; do ls -l "$root/$f"; done
echo "== still empty — fill these in by hand (nano), then deploy.sh:"
for f in "${files[@]}"; do grep -Hn '^[A-Z_]*=$' "$root/$f" || true; done
