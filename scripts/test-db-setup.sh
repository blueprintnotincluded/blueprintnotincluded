#!/bin/bash
# Make sure the MongoDB the tests will use is reachable, starting it when it
# is not. The tests read DB_URI from .env.test.local first, then the
# environment, then .env.test (see __tests__/hooks.ts) — resolve it the same
# way here so this script checks the server the tests will actually connect to.
set -e

read_env_file() { [ -f "$1" ] && sed -n 's/^DB_URI=//p' "$1" | head -1 | tr -d '"'"'"; }
uri=$(read_env_file .env.test.local || true)
[ -n "$uri" ] || uri="${DB_URI:-}"
[ -n "$uri" ] || uri=$(read_env_file .env.test || true)
# mongodb://[user:pass@]host[:port]/db → host and port
hostport=${uri#*://}; hostport=${hostport##*@}; hostport=${hostport%%/*}
host=${hostport%%:*}; port=${hostport##*:}
[ "$port" = "$host" ] && port=27017
host=${host:-localhost}

if nc -z "$host" "$port"; then
    echo "MongoDB is already running on $host:$port"
    exit 0
fi

echo "MongoDB is not running on $host:$port"
# Inside the dev container there is no docker, and the database is a sibling
# service that compose already started — so an unreachable one here is a real
# fault to report, not something to paper over by starting another.
if ! command -v docker >/dev/null 2>&1; then
    echo "No docker client here. If you are in the dev container, the 'database'"
    echo "service is down or DB_URI ($host:$port) does not name it."
    exit 1
fi
echo "Starting MongoDB via Docker..."
docker compose up -d database

echo "Waiting for MongoDB to be ready..."
timeout=30
while ! nc -z "$host" "$port"; do
    timeout=$((timeout - 1))
    if [ $timeout -eq 0 ]; then
        echo "Timeout waiting for MongoDB to start"
        exit 1
    fi
    sleep 1
done
echo "MongoDB is ready!"
