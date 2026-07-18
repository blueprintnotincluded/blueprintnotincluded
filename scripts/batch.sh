#!/bin/sh
# Batch-task dispatcher so the same npm task runs in a dev checkout and in the
# deploy image. Dev has TS sources + ts-node (devDependency); the deploy image
# ships only compiled JS (npm ci --omit=dev, no app/**/*.ts), with this script
# and package.json copied into /bpni/build by scripts/copy_assets.sh.
#
# Usage: ./scripts/batch.sh <basename-under-app/api/batch> [args...]
# Must run from a directory containing app/api/batch/ — the repo root in dev,
# /bpni/build in the deploy console. npm run sets that cwd automatically.
set -e
name="$1"
shift
if [ -f "app/api/batch/$name.js" ]; then
  exec node "app/api/batch/$name.js" "$@"
fi
export TS_NODE_TRANSPILE_ONLY=true
exec node_modules/.bin/ts-node "app/api/batch/$name.ts" "$@"
