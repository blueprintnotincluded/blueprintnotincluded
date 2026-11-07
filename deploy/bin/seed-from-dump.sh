#!/bin/bash
# Replace a project's database with a dump of another MongoDB — through R2 or
# straight from the other project, never through a file on the box.
#
#   seed-from-dump.sh <production|staging> dump    <source mongodb uri | env | local>
#   seed-from-dump.sh <production|staging> restore <archive>
#   seed-from-dump.sh <production|staging> all     <source mongodb uri | env | local>
#   seed-from-dump.sh <production|staging> clone   <production|staging>
#
# `dump` streams a gzip mongodump archive of the source's `blueprintnotincluded`
# database (every collection — previewimages too, so the restored site comes
# up with warm previews) to r2:<bucket>/seeds/seed-<stamp>.archive.gz and
# prints that name on stdout, progress on stderr. `local` as the source dumps
# the project's own database with its root credentials. The nightly backup
# prunes seeds/ after BACKUP_KEEP_SEED_DAYS (30).
# `restore` empties the project's `blueprintnotincluded` database (every
# collection dropped; the users in `admin` and the database's own `bpni` user
# are untouched) and streams the archive into it, then prints collection
# counts. The archive is one of:
#   seed-<stamp>.archive.gz           a seed, under seeds/
#   latest                            the project's newest nightly, daily/
#   <project>/<daily|weekly|monthly>/<name>
#                                     any archive in the bucket, by path
# `all` does both, and stops before touching the database when the dump
# fails. `clone` pipes mongodump of the source project into mongorestore of
# the target on this box — the staging refresh — and stores nothing anywhere.
#
# Uses:
#   - copying another cluster in: put its URI in the environment rather than
#     on the command line, so it never shows in `ps` or the shell history
#     (`env` as the source means "read SEED_SOURCE_URI"):
#       read -rs SEED_SOURCE_URI && export SEED_SOURCE_URI
#       seed-from-dump.sh production all env
#     For a cut-over with the least downtime, split it: `dump env` while the
#     app still serves, then `compose.sh production stop app`, `restore <name>`,
#     `compose.sh production up -d app` (up, not start: start keeps the old
#     environment). The dump is per collection, not one point in time (no
#     --oplog: the target may be a standalone and --oplog excludes --db), so a
#     write to the source after the dump started may or may not be in it — stop
#     or quiesce the source first when that matters.
#   - refreshing staging from production on the same box:
#       seed-from-dump.sh staging clone production
#   - restoring a nightly into production (Rebuild from scratch):
#       seed-from-dump.sh production restore latest
#
# Everything runs inside the project's backup image (mongodump, mongorestore,
# rclone), so the host needs nothing installed; `dump` and `restore` need the
# R2_* variables in the project's .env, `clone` needs none. Credentials reach
# the tools through a 0600 config file written inside the container, never as
# arguments. The app keeps running during a restore; stop it first for a
# consistent cut-over (`compose.sh production stop app`), start it after.
set -euo pipefail
# Without this, `name=$(do_dump …)` in `all` would carry on after a failed
# mongodump: errexit is switched off inside a command substitution by default,
# so the function would still print a name for an archive that was never
# written and the restore would then drop the database for nothing.
shopt -s inherit_errexit

here=$(cd "$(dirname "$0")" && pwd)
compose="$here/compose.sh"
root=${BPNI_ROOT:-/srv/bpni}

usage="usage: seed-from-dump.sh <production|staging> <dump|restore|all|clone> <uri|env|local|archive|project>"
project=${1:?$usage}
mode=${2:?$usage}
arg=${3:?$usage}
db=blueprintnotincluded

getenv() { # <project> <KEY>; empty, not a failure, when the file lacks it
  local out
  out=$(grep -E "^$2=" "$root/$1/.env") || [ $? -eq 1 ] || { echo "cannot read $root/$1/.env" >&2; exit 66; }
  printf '%s\n' "$out" | tail -n1 | cut -d= -f2- | tr -d '"'
}
root_pw() { getenv "$project" MONGO_ROOT_PASSWORD; }
bucket() { local b; b=$(getenv "$project" R2_BUCKET); echo "r2:${b:-bpni-backups}"; }

# A mongodump/mongorestore/rclone run inside the backup image. The connection
# URI travels in the TOOL_URI environment variable (`-e TOOL_URI` with no
# value copies it from this process's environment, so it is never an argument
# on the host) and is written to a 0600 `--config` file inside the container,
# so it is in no process's arguments there either; the shell line given runs
# with $cfg set to that file. Stdin and stdout pass through, for `clone`.
tool() { # <project> <uri> <shell line>
  TOOL_URI="$2" "$compose" "$1" --profile backup run --rm --no-deps -T -e TOOL_URI backup bash -c '
    set -euo pipefail
    cfg=$(mktemp /tmp/tool.XXXXXX)
    trap "rm -f $cfg" EXIT
    chmod 600 "$cfg"
    printf "uri: \"%s\"\n" "$TOOL_URI" > "$cfg"
    eval "$1"
  ' -- "$3"
}

# mongosh as root inside the project's mongo container. The password goes in
# through the environment (`-e MONGO_PW`, copied from this process's
# environment, never an argument on the host) and the script authenticates
# with process.env.MONGO_PW itself, so it is in no argument list in the
# container either. `db` is then the project database.
mongosh_root() { # <project> <script>
  local pw
  pw=$(getenv "$1" MONGO_ROOT_PASSWORD)
  MONGO_PW="$pw" "$compose" "$1" exec -T -e MONGO_PW mongo mongosh --quiet --eval \
    'db.getSiblingDB("admin").auth("root", process.env.MONGO_PW); db = db.getSiblingDB("'"$db"'"); '"$2"
}

local_uri() { echo "mongodb://root:$(getenv "$1" MONGO_ROOT_PASSWORD)@mongo:27017/?authSource=admin"; }

source_uri() {
  case "$1" in
    env) : "${SEED_SOURCE_URI:?set SEED_SOURCE_URI in the environment (see the header)}"; echo "$SEED_SOURCE_URI" ;;
    local) local_uri "$project" ;;
    *) echo "$1" ;;
  esac
}

do_dump() {
  local uri
  uri=$(source_uri "$1")
  local name="seed-$(date -u +%Y%m%dT%H%M%SZ).archive.gz"
  local target="$(bucket)/seeds/$name" staging="$(bucket)/incoming/$name"
  # Progress to stderr: stdout carries only the archive name, for `all`.
  echo "== dumping $db from the source into $target (previewimages included; several GB, be patient)" >&2
  # A failed dump leaves rclone with an end-of-stream, not an error, so the
  # archive is uploaded under incoming/ and moved into seeds/ only once
  # mongodump exited cleanly; the partial object is deleted otherwise (and the
  # nightly backup sweeps incoming/ in case even that failed).
  tool "$project" "$uri" '
    if ! mongodump --config="$cfg" --db='"$db"' --gzip --archive | rclone rcat '"$staging"'; then
      rclone deletefile '"$staging"' || true
      exit 1
    fi
    rclone moveto '"$staging"' '"$target"'
    rclone lsf --format "sp" '"$target"'' >&2
  echo "$name"
}

# The bucket path of a restore argument, or exit 64. The result is spliced
# into the shell line `tool` runs, so only path characters get through —
# checked on the resolved path, which for `latest` is a name the bucket
# listing supplied, not the operator.
resolve() {
  local resolved
  case "$1" in
    seed-*.archive.gz) resolved="$(bucket)/seeds/$1" ;;
    latest)
      local prefix newest name
      name=$(getenv "$project" COMPOSE_PROJECT_NAME)
      [ -n "$name" ] || { echo "COMPOSE_PROJECT_NAME is not set in $root/$project/.env" >&2; exit 65; }
      prefix="$(bucket)/$name/daily/"
      newest=$(tool "$project" "" 'rclone lsf --format "p" --files-only '"$prefix" | sort | tail -n1)
      [ -n "$newest" ] || { echo "no archive under $prefix" >&2; exit 66; }
      resolved="$prefix$newest" ;;
    */daily/*.archive.gz|*/weekly/*.archive.gz|*/monthly/*.archive.gz) resolved="$(bucket)/$1" ;;
    *) echo "archive must be a seed name, latest, or <project>/<daily|weekly|monthly>/<name>" >&2; exit 64 ;;
  esac
  case "${resolved#r2:}" in
    *[!A-Za-z0-9._/-]*) echo "archive names are letters, digits, . _ - and /: $resolved" >&2; exit 64 ;;
  esac
  echo "$resolved"
}

do_restore() {
  local archive
  archive=$(resolve "$1")
  # Checked before anything is dropped.
  [ -n "$(tool "$project" "" 'rclone lsf '"$archive")" ] || { echo "$archive not found" >&2; exit 66; }
  echo "== emptying $project's $db (every collection; users are kept)"
  # Not dropDatabase: dropping collections one by one leaves the database's
  # own users (the app's `bpni`) in place and touches nothing else.
  mongosh_root "$project" 'db.getCollectionNames().forEach(c => { db.getCollection(c).drop(); print("dropped " + c); })'
  echo "== restoring $archive"
  tool "$project" "$(local_uri "$project")" \
    'rclone cat '"$archive"' | mongorestore --config="$cfg" --nsInclude='"$db"'.* --gzip --archive'
  finish
}

do_clone() {
  local source=$1
  [ -f "$root/$source/.env" ] || { echo "$root/$source/.env not found" >&2; exit 66; }
  [ "$source" != "$project" ] || { echo "clone needs two different projects" >&2; exit 64; }
  # The source's mongo answering as root is the one failure that would
  # otherwise be found only after the target had been emptied.
  echo "== checking $source's mongo"
  mongosh_root "$source" 'if (!db.stats().ok) throw new Error("source database not ok")' >/dev/null
  echo "== emptying $project's $db (every collection; users are kept)"
  mongosh_root "$project" 'db.getCollectionNames().forEach(c => { db.getCollection(c).drop(); print("dropped " + c); })'
  echo "== piping $source's $db into $project (previewimages included; several GB, be patient)"
  tool "$source" "$(local_uri "$source")" 'mongodump --config="$cfg" --db='"$db"' --gzip --archive' \
    | tool "$project" "$(local_uri "$project")" 'mongorestore --config="$cfg" --nsInclude='"$db"'.* --gzip --archive'
  finish
}

finish() {
  echo "== collection counts"
  mongosh_root "$project" 'db.getCollectionNames().sort().forEach(c => print(c.padEnd(28), db.getCollection(c).estimatedDocumentCount()))'
  echo "== next: run migrations, then check the site"
  echo "   $compose $project exec app npm run migrate:status"
  echo "   $compose $project exec app npm run migrate:up"
}

case "$mode" in
  dump) do_dump "$arg" ;;
  restore) do_restore "$arg" ;;
  all)
    name=$(do_dump "$arg")
    do_restore "$name"
    ;;
  clone) do_clone "$arg" ;;
  *) echo "mode must be dump, restore, all or clone" >&2; exit 64 ;;
esac
