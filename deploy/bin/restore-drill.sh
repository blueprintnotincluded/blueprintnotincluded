#!/bin/bash
# Prove last night's backup restores: fetch the newest daily archive from R2,
# restore it into a throwaway mongo:8.2.12 container, compare collection counts
# with the live database, tear it all down. Exit status is the verdict.
#
#   restore-drill.sh [production]
#
# Run it once after the first nightly backup, and again whenever the backup
# image, the exclusions or the retention change. Takes a minute or two; the
# live stack is untouched (the throwaway mongo joins the project's compose
# network under its own name so the backup image can reach it, and is removed
# on exit either way).
#
# Tolerance: a count may be lower in the archive than live by up to
# DRILL_TOLERANCE_PERCENT (default 5), since the site keeps writing after the
# dump. Excluded collections (previewimages) are expected to be absent.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
compose="$here/compose.sh"
root=${BPNI_ROOT:-/srv/bpni}
project=${1:-production}
db=blueprintnotincluded
tolerance=${DRILL_TOLERANCE_PERCENT:-5}

envfile="$root/$project/.env"
getenv() { grep -E "^$1=" "$envfile" | tail -n1 | cut -d= -f2- | tr -d '"'; }
project_name=$(getenv COMPOSE_PROJECT_NAME)
root_pw=$(getenv MONGO_ROOT_PASSWORD)
bucket=$(getenv R2_BUCKET); bucket=${bucket:-bpni-backups}
remote="r2:${bucket}/${project_name}"
excluded=$(getenv BACKUP_EXCLUDE_COLLECTIONS); excluded=${excluded:-previewimages}
network="${project_name}_default"
drill="${project_name}-restore-drill"

cleanup() {
  docker rm -f "$drill" >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup

run() {
  "$compose" "$project" --profile backup run --rm --no-deps -T backup "$@"
}

echo "== newest daily archive in $remote/daily/"
newest=$(run rclone lsf --format "p" --files-only "$remote/daily/" | sort | tail -n1)
[ -n "$newest" ] || { echo "no archive found under $remote/daily/" >&2; exit 1; }
echo "   $newest"

echo "== starting throwaway mongo ($drill on $network)"
docker run -d --rm --name "$drill" --network "$network" --memory 768m \
  mongo:8.2.12 mongod --wiredTigerCacheSizeGB 0.25 >/dev/null
for _ in $(seq 1 30); do
  if docker exec "$drill" mongosh --quiet --eval "db.adminCommand('ping').ok" 2>/dev/null | grep -q 1; then break; fi
  sleep 2
done

echo "== fetching and restoring"
run bash -c "rclone copyto '$remote/daily/$newest' /dumps/drill.archive.gz \
  && mongorestore --uri='mongodb://$drill:27017' --nsInclude='$db.*' --drop --gzip --archive=/dumps/drill.archive.gz --quiet \
  && rm -f /dumps/drill.archive.gz"

# Collection counts from a mongo container. The live one needs the root
# password: `-e MONGO_PW` with no value copies it from this process's
# environment into the exec, and the mongosh script authenticates with
# process.env.MONGO_PW itself, so the password is in no argument list on the
# host or in the container.
counts() {
  # $1: container, $2: "root" for the authenticated live mongo, "" for the drill
  if [ "$2" = root ]; then
    MONGO_PW="$root_pw" docker exec -e MONGO_PW "$1" mongosh --quiet --eval \
      'db.getSiblingDB("admin").auth("root", process.env.MONGO_PW); db = db.getSiblingDB("'"$db"'");
       db.getCollectionNames().sort().forEach(c => print(c + " " + db.getCollection(c).estimatedDocumentCount()))'
  else
    docker exec "$1" mongosh --quiet "$db" --eval \
      'db.getCollectionNames().sort().forEach(c => print(c + " " + db.getCollection(c).estimatedDocumentCount()))'
  fi
}
live_container="$("$compose" "$project" ps -q mongo)"
live=$(counts "$live_container" root)
restored=$(counts "$drill" "")

echo "== collection counts (live -> restored)"
status=0
while read -r name live_n; do
  [ -n "$name" ] || continue
  restored_n=$(echo "$restored" | awk -v n="$name" '$1==n {print $2}')
  if echo ",$excluded," | grep -q ",$name,"; then
    if [ -z "$restored_n" ]; then
      printf '   %-28s %8s -> %8s  excluded, as configured\n' "$name" "$live_n" "-"
    else
      printf '   %-28s %8s -> %8s  UNEXPECTED: excluded collection is in the archive\n' "$name" "$live_n" "$restored_n"
      status=1
    fi
    continue
  fi
  if [ -z "$restored_n" ]; then
    if [ "$live_n" = 0 ]; then
      printf '   %-28s %8s -> %8s  ok (empty live collection, not in the archive)\n' "$name" "$live_n" "-"
    else
      printf '   %-28s %8s -> %8s  MISSING\n' "$name" "$live_n" "-"
      status=1
    fi
    continue
  fi
  floor=$(( live_n * (100 - tolerance) / 100 ))
  if [ "$restored_n" -ge "$floor" ]; then
    printf '   %-28s %8s -> %8s  ok\n' "$name" "$live_n" "$restored_n"
  else
    printf '   %-28s %8s -> %8s  SHORT (more than %s%% below live)\n' "$name" "$live_n" "$restored_n" "$tolerance"
    status=1
  fi
done <<< "$live"

if [ "$status" = 0 ]; then
  echo "== restore drill PASSED ($newest)"
else
  echo "== restore drill FAILED ($newest)" >&2
fi
exit "$status"
