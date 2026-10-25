#!/bin/bash
# Replace a project's database with a dump of another MongoDB.
#
#   seed-from-dump.sh <production|staging> dump    <source mongodb uri | env | local>
#   seed-from-dump.sh <production|staging> restore <archive>
#   seed-from-dump.sh <production|staging> all     <source mongodb uri | env>
#
# `dump` writes /srv/bpni/dumps/seed-<stamp>.archive.gz (gzip mongodump
# archive of the source's `blueprintnotincluded` database, every collection
# included — previewimages too, so the restored site comes up with warm
# previews) and prints the archive name on stdout, progress on stderr. `local`
# as the source dumps the project's own database with its root credentials.
# `restore` empties the project's `blueprintnotincluded` database (every
# collection dropped; the users in `admin` and the database's own `bpni` user
# are untouched) and restores the archive into it, then prints collection
# counts. The archive is a name in /srv/bpni/dumps; a full path to a file in
# that directory is accepted too. `all` does both, and stops before touching
# the database when the dump fails.
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
#   - refreshing staging from production on the same box, through the shared
#     /srv/bpni/dumps directory, no cross-project network needed:
#       seed-from-dump.sh production dump local      # prints the archive name
#       seed-from-dump.sh staging restore <archive>
#
# Everything runs inside the project's backup image (mongodump/mongorestore),
# so the host needs nothing installed. Credentials reach the tools through a
# 0600 config file written inside the container, never as arguments. The app
# keeps running during a restore; stop it first for a consistent cut-over
# (`compose.sh production stop app`), start it after.
set -euo pipefail
# Without this, `name=$(do_dump …)` in `all` would carry on after a failed
# mongodump: errexit is switched off inside a command substitution by default,
# so the function would still print a name for an archive that was never
# written and the restore would then drop the database for nothing.
shopt -s inherit_errexit

here=$(cd "$(dirname "$0")" && pwd)
compose="$here/compose.sh"
root=${BPNI_ROOT:-/srv/bpni}
dumps="$root/dumps"

usage="usage: seed-from-dump.sh <production|staging> <dump|restore|all> <uri|env|local|archive>"
project=${1:?$usage}
mode=${2:?$usage}
arg=${3:?$usage}
db=blueprintnotincluded

root_pw() {
  grep -E '^MONGO_ROOT_PASSWORD=' "$root/$project/.env" | tail -n1 | cut -d= -f2- | tr -d '"'
}

# A mongodump/mongorestore run inside the backup image. The connection URI
# travels in the TOOL_URI environment variable (`-e TOOL_URI` with no value
# copies it from this process's environment, so it is never an argument on
# the host) and is written to a 0600 `--config` file inside the container, so
# it is in no process's arguments there either.
tool() {
  local uri=$1; shift
  TOOL_URI="$uri" "$compose" "$project" --profile backup run --rm --no-deps -T -e TOOL_URI backup bash -c '
    set -euo pipefail
    cfg=$(mktemp /tmp/tool.XXXXXX)
    trap "rm -f $cfg" EXIT
    chmod 600 "$cfg"
    printf "uri: \"%s\"\n" "$TOOL_URI" > "$cfg"
    "$@" --config="$cfg"
  ' -- "$@"
}

# mongosh as root inside the project's mongo container. The password goes in
# through the environment (`-e MONGO_PW`, copied from this process's
# environment, never an argument on the host) and the script authenticates
# with process.env.MONGO_PW itself, so it is in no argument list in the
# container either. `db` is then the project database.
mongosh_root() {
  local pw
  pw=$(root_pw)
  MONGO_PW="$pw" "$compose" "$project" exec -T -e MONGO_PW mongo mongosh --quiet --eval \
    'db.getSiblingDB("admin").auth("root", process.env.MONGO_PW); db = db.getSiblingDB("'"$db"'"); '"$1"
}

source_uri() {
  case "$1" in
    env) : "${SEED_SOURCE_URI:?set SEED_SOURCE_URI in the environment (see the header)}"; echo "$SEED_SOURCE_URI" ;;
    local) echo "mongodb://root:$(root_pw)@mongo:27017/?authSource=admin" ;;
    *) echo "$1" ;;
  esac
}

do_dump() {
  local uri
  uri=$(source_uri "$1")
  local name="seed-$(date -u +%Y%m%dT%H%M%SZ).archive.gz"
  mkdir -p "$dumps"
  # Progress to stderr: stdout carries only the archive name, for `all`.
  echo "== dumping $db from the source into $dumps/$name (previewimages included; several GB, be patient)" >&2
  tool "$uri" mongodump --db="$db" --gzip --archive="/dumps/$name" >&2
  ls -lh "$dumps/$name" >&2
  echo "$name"
}

do_restore() {
  local archive
  case "$1" in
    */*) # a path: only a file in the dumps directory, so a same-named archive
         # elsewhere can never be mistaken for the one that gets restored
      [ "$(cd "$(dirname -- "$1")" 2>/dev/null && pwd -P)" = "$(cd "$dumps" && pwd -P)" ] \
        || { echo "archive must be a name or a file in $dumps" >&2; exit 64; }
      archive=$(basename -- "$1") ;;
    *) archive=$1 ;;
  esac
  [ -f "$dumps/$archive" ] || { echo "$dumps/$archive not found" >&2; exit 66; }
  echo "== emptying $project's $db (every collection; users are kept)"
  # Not dropDatabase: dropping collections one by one leaves the database's
  # own users (the app's `bpni`) in place and touches nothing else.
  mongosh_root 'db.getCollectionNames().forEach(c => { db.getCollection(c).drop(); print("dropped " + c); })'
  echo "== restoring $archive"
  tool "mongodb://root:$(root_pw)@mongo:27017/?authSource=admin" \
    mongorestore --nsInclude="$db.*" --gzip --archive="/dumps/$archive"
  echo "== collection counts"
  mongosh_root 'db.getCollectionNames().sort().forEach(c => print(c.padEnd(28), db.getCollection(c).estimatedDocumentCount()))'
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
  *) echo "mode must be dump, restore or all" >&2; exit 64 ;;
esac
