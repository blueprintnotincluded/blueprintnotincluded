#!/bin/bash
# Dump the database straight into R2: mongodump writes the gzip archive to
# stdout and rclone streams it to the bucket, so nothing lands on the box.
#
#   daily/<db>-<stamp>.archive.gz    every night, kept BACKUP_KEEP_DAILY_DAYS (14)
#   weekly/<db>-<stamp>.archive.gz   Sundays (a server-side copy of that night's
#                                    daily), kept BACKUP_KEEP_WEEKLY_DAYS (56)
#   monthly/<db>-<stamp>.archive.gz  first Sunday of the month: a second, full
#                                    dump with EVERY collection, kept
#                                    BACKUP_KEEP_MONTHLY_DAYS (62, so two)
#   seeds/<name>                     ad-hoc archives from bin/seed-from-dump.sh,
#                                    kept BACKUP_KEEP_SEED_DAYS (30)
#
# BACKUP_EXCLUDE_COLLECTIONS (comma-separated) is left out of the daily and
# weekly archives. In production that is `previewimages`: a cache of rendered
# preview WebPs (~3 GB, ~600 KB per blueprint) that the app rebuilds on request
# and that would multiply the bucket's size by ten. A daily restore therefore
# comes up with cold previews, re-rendered as pages are viewed or all at once
# with `npm run backfill-previews`; the monthly archive has them, so a rebuilt
# box restored from it comes up warm.
#
# A dump that fails part-way would still leave a complete-looking object in
# the bucket (rclone sees end-of-stream, not an error), so every archive is
# uploaded under incoming/ and moved to its prefix (server side) only once
# mongodump has exited cleanly; a failed upload is deleted, and incoming/ is
# swept of anything older than a day in case even that failed. Nothing under
# daily/, weekly/ or monthly/ is ever a partial dump. The pruning runs only
# after a successful dump: a night whose dump failed keeps every old archive.
#
# BACKUP_HEARTBEAT_URL, when set, is pinged once at the very end: after the
# daily archive is in place, the Sunday copies are made and the pruning is
# done. It is a dead-man's switch (Better Stack heartbeat): the monitor alerts
# when the ping stops arriving, so a dead container, empty credentials or a box
# that is off all read the same way. A failed ping is reported but never fails
# the backup; an unset URL (staging, tests) skips it silently.
#
# Run by crond inside the backup container (see entrypoint.sh), or by hand for
# an ad-hoc pre-migration snapshot:
#   bin/compose.sh production exec backup backup.sh
set -euo pipefail

: "${BACKUP_MONGO_URI:?}"
: "${BACKUP_DB:?}"
: "${BACKUP_REMOTE:?}"
: "${BACKUP_KEEP_DAILY_DAYS:=14}"
: "${BACKUP_KEEP_WEEKLY_DAYS:=56}"
: "${BACKUP_KEEP_MONTHLY_DAYS:=62}"
: "${BACKUP_KEEP_SEED_DAYS:=30}"
# The bucket root: BACKUP_REMOTE is r2:<bucket>/<project>, seeds live beside
# the projects.
seeds="${BACKUP_REMOTE%/*}/seeds"
incoming="${BACKUP_REMOTE%/*}/incoming"

stamp=$(date -u +%Y%m%dT%H%M%SZ)
name="${BACKUP_DB}-${stamp}.archive.gz"

# The connection URI (with the backup user's password) goes to mongodump
# through a 0600 config file rather than an argument, so it never shows in
# the process list.
cfg=$(mktemp /tmp/backup.XXXXXX)
trap 'rm -f "$cfg"' EXIT
chmod 600 "$cfg"
printf 'uri: "%s"\n' "$BACKUP_MONGO_URI" > "$cfg"

exclude=()
IFS=',' read -r -a excluded <<< "${BACKUP_EXCLUDE_COLLECTIONS:-}"
for c in "${excluded[@]}"; do
  c=$(echo "$c" | tr -d '[:space:]')
  [ -n "$c" ] && exclude+=("--excludeCollection=$c")
done

# dump <remote object> [mongodump options…]: stream one archive into incoming/
# and move it to its place, or delete the partial object and fail.
dump() {
  local target=$1; shift
  local staging="$incoming/${target##*/}"
  if ! mongodump --config="$cfg" --db="$BACKUP_DB" "$@" --gzip --archive --quiet \
      | rclone rcat "$staging"; then
    echo "backup: dump to $target failed, deleting the partial upload" >&2
    rclone deletefile "$staging" || true
    return 1
  fi
  rclone moveto "$staging" "$target"
  echo "backup: uploaded $target ($(rclone lsf --format "s" "$target" | numfmt --to=iec 2>/dev/null || true))"
}

echo "backup: dumping $BACKUP_DB (excluding: ${BACKUP_EXCLUDE_COLLECTIONS:-nothing}) to $BACKUP_REMOTE/daily/"
dump "$BACKUP_REMOTE/daily/$name" "${exclude[@]}"
if [ "$(date -u +%u)" = "7" ]; then
  echo "backup: Sunday, also keeping it under weekly/"
  rclone copyto "$BACKUP_REMOTE/daily/$name" "$BACKUP_REMOTE/weekly/$name"
  if [ "$(date -u +%d)" -le 7 ]; then
    echo "backup: first Sunday of the month, dumping every collection to monthly/"
    dump "$BACKUP_REMOTE/monthly/$name"
  fi
fi

echo "backup: pruning daily/ older than ${BACKUP_KEEP_DAILY_DAYS}d, weekly/ ${BACKUP_KEEP_WEEKLY_DAYS}d, monthly/ ${BACKUP_KEEP_MONTHLY_DAYS}d, seeds/ ${BACKUP_KEEP_SEED_DAYS}d"
rclone delete --min-age "${BACKUP_KEEP_DAILY_DAYS}d" "$BACKUP_REMOTE/daily/"
rclone delete --min-age "${BACKUP_KEEP_WEEKLY_DAYS}d" "$BACKUP_REMOTE/weekly/"
rclone delete --min-age "${BACKUP_KEEP_MONTHLY_DAYS}d" "$BACKUP_REMOTE/monthly/"
rclone delete --min-age "${BACKUP_KEEP_SEED_DAYS}d" "$seeds/"
rclone delete --min-age 1d "$incoming/"

# The closing report is informational: a listing that fails must not stand
# between a backup that landed and its heartbeat.
echo "backup: done ($name). Archives now in R2:"
{ rclone lsf --format "tsp" "$BACKUP_REMOTE/daily/" | tail -n 3; } \
  || echo "backup: could not list $BACKUP_REMOTE/daily/" >&2
rclone size "${BACKUP_REMOTE%/*}" || echo "backup: could not size the bucket" >&2

if [ -n "${BACKUP_HEARTBEAT_URL:-}" ]; then
  curl -fsS -m 10 --retry 3 -o /dev/null "$BACKUP_HEARTBEAT_URL" \
    || echo "backup: heartbeat ping failed" >&2
fi
