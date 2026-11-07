#!/bin/bash
# Deploy (or redeploy) one project: pull the tag it follows, recreate what
# changed, wait for health, then check the public hostname end to end.
#
#   deploy.sh <production|staging>
#
# This is what publish.yml (staging) and promote.yml (production) run over SSH;
# it is equally fine to run by hand. Idempotent: an unchanged image is a no-op
# apart from the health check.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
project=${1:?usage: deploy.sh <production|staging>}
compose="$here/compose.sh"

# Read PUBLIC_HOSTNAME from the project's .env for the final check.
root=${BPNI_ROOT:-/srv/bpni}
public_host=$(grep -E '^PUBLIC_HOSTNAME=' "$root/$project/.env" | tail -n1 | cut -d= -f2- | tr -d '"' || true)

echo "== $project: pulling"
# --ignore-buildable: the backup sidecar is built here, not pulled.
"$compose" "$project" pull --quiet --ignore-buildable

echo "== $project: building the backup image (no-op when unchanged)"
# --profile backup: the sidecar only *runs* in production, but every project
# needs the image for the one-off seed/restore commands.
"$compose" "$project" --profile backup build --quiet backup

echo "== $project: starting"
# --wait returns once every service with a healthcheck reports healthy, or
# fails after --wait-timeout. The app's start_period is 60 s; mongo's 30 s.
"$compose" "$project" up -d --remove-orphans --wait --wait-timeout 180

# The image this project ran until a moment ago is untagged now; without this
# every deploy leaves one behind and the disk fills (2026-11-07: it did).
echo "== $project: pruning dangling images"
docker image prune -f | tail -n 1

if [ "$project" = production ]; then
  # The weekly restore drill (bin/drill-weekly.sh, README "Backup monitoring")
  # runs from this user's crontab: Sundays 05:00 UTC, after the 03:30 backup and
  # its weekly copy. Installed here so a rebuilt box gets it with its first
  # deploy; the marker keeps one line however often this runs. The deploy user
  # has docker but not root, so no system unit.
  echo "== $project: weekly restore drill in crontab"
  marker="# bpni drill-weekly"
  line="0 5 * * 0 $here/drill-weekly.sh $marker"
  { crontab -l 2>/dev/null | grep -vF "$marker" || true; echo "$line"; } | crontab -
fi

echo "== $project: running"
"$compose" "$project" ps
"$compose" "$project" exec -T app node -e "fetch('http://127.0.0.1:3000/api/version').then(r => r.json()).then(v => console.log('version', v.version, 'commit', v.buildCommit, 'built', v.buildTime))"

if [ -n "$public_host" ]; then
  echo "== $project: https://$public_host/api/health"
  # The tunnel reconnects within seconds of the app container restarting;
  # give it a few tries before calling the deploy failed.
  for attempt in 1 2 3 4 5 6; do
    if curl -fsS --max-time 10 "https://$public_host/api/health" >/dev/null; then
      echo "ok"
      exit 0
    fi
    sleep 10
  done
  echo "https://$public_host/api/health did not answer 200 after $attempt tries" >&2
  exit 1
fi
