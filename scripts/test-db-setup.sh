#!/bin/bash
# Make sure the MongoDB the tests will use is reachable, starting it when it
# is not. The tests read DB_URI from the environment, then .env.test.local,
# then .env.test (see __tests__/hooks.ts) — resolve it the same way here so
# this script checks the server the tests will actually connect to.
set -e

uri="${DB_URI:-}"
for f in .env.test.local .env.test; do
  [ -n "$uri" ] && break
  [ -f "$f" ] && uri=$(sed -n 's/^DB_URI=//p' "$f" | head -1 | tr -d '"'"'")
done
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
