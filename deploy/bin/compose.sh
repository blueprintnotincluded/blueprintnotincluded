#!/bin/bash
# docker compose for one of the two projects on the box.
#
#   compose.sh <production|staging> <any docker compose arguments>
#
#   compose.sh production ps
#   compose.sh staging logs -f --tail 100 app
#   compose.sh production exec app npm run migrate:status
#
# The project directory (/srv/bpni/<project>) holds that project's .env and
# app.env and names its volumes; the compose file is the shared copy the
# workflow rsyncs to /srv/bpni/deploy. Override either with BPNI_ROOT.
set -euo pipefail

root=${BPNI_ROOT:-/srv/bpni}
project=${1:-}
case "$project" in
  production|staging) shift ;;
  *)
    echo "usage: $(basename "$0") <production|staging> <docker compose args...>" >&2
    exit 64
    ;;
esac

dir="$root/$project"
[ -f "$dir/.env" ] || { echo "$dir/.env is missing (copy deploy/env/$project.env.example)" >&2; exit 66; }
[ -f "$dir/app.env" ] || { echo "$dir/app.env is missing (copy deploy/env/app.env.example)" >&2; exit 66; }

# The log shipper (`vector`, README "Log shipping") is in the `logs` profile:
# on in production when BETTERSTACK_SOURCE_TOKEN is set in its .env, never
# in staging, because the one production instance already ships both
# projects. Added to whatever COMPOSE_PROFILES the caller or the .env gives,
# so `backup` stays on. Empty when the variable is absent; an unreadable
# .env is fatal, as compose would be.
getenv() {
  local out
  out=$(grep -E "^$1=" "$dir/.env") || [ $? -eq 1 ] || { echo "cannot read $dir/.env" >&2; exit 66; }
  printf '%s\n' "$out" | tail -n1 | cut -d= -f2- | tr -d '"'
}
if [ "$project" = production ]; then
  # An assignment, so a getenv that fails ends the script under set -e.
  token=$(getenv BETTERSTACK_SOURCE_TOKEN)
  if [ -n "$token" ]; then
    profiles=${COMPOSE_PROFILES-}
    [ -n "${COMPOSE_PROFILES+set}" ] || profiles=$(getenv COMPOSE_PROFILES)
    case ",$profiles," in
      *,logs,*) ;;
      *) export COMPOSE_PROFILES="${profiles:+$profiles,}logs" ;;
    esac
  fi
  unset token
fi

# vector.yaml's hash for the shipper's label (compose.yml): an `up` after the
# workflow synced a changed config recreates the container.
vector_config="$root/deploy/vector/vector.yaml"
if [ -f "$vector_config" ]; then
  VECTOR_CONFIG_HASH=$(sha256sum < "$vector_config" | cut -c1-16)
  export VECTOR_CONFIG_HASH
fi

exec docker compose --project-directory "$dir" -f "$root/deploy/compose.yml" "$@"
