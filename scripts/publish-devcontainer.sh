#!/usr/bin/env bash
# Build the dev container image from origin/master and push it to ghcr.io.
#
#   scripts/publish-devcontainer.sh                        # build, smoke-test, push
#   scripts/publish-devcontainer.sh --dry-run              # build and smoke-test only
#   scripts/publish-devcontainer.sh --dry-run --ref HEAD   # ...of an unmerged commit
#
# By hand, never in CI: the dev image has one user, and rebuilding it on every
# push spent CI minutes for nothing. Run it after merging a change to
# .devcontainer/. It builds exactly what origin/master has (a `git archive` of
# .devcontainer/ at the freshly fetched tip, into a temporary directory), so
# the checkout it runs from — its branch, its uncommitted edits — never leaks
# into the image.
#
# The tag comes from the `image:` line in .devcontainer/docker-compose.yml, and
# a tag that is already published is never overwritten: a checkout that pulled
# it must keep getting the same toolchain. A Dockerfile change therefore needs
# a new tag in that file first (the comment there says which).
#
# Credentials: GHCR_TOKEN, or else `gh auth token` — a token with
# write:packages (`gh auth refresh -h github.com -s write:packages`).
# GHCR_USER, or else the gh login. CONTAINER_CLI picks docker or podman.
set -euo pipefail

usage() { echo "usage: $0 [--dry-run [--ref <commit>]]" >&2; exit 2; }
die() { echo "publish-devcontainer: $*" >&2; exit 1; }

DRY_RUN=0
REF=
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    # A branch's Dockerfile change can be built and smoke-tested before it
    # merges; only origin/master is ever pushed.
    --ref) [ $# -ge 2 ] || usage; REF=$2; shift ;;
    *) usage ;;
  esac
  shift
done
[ -z "$REF" ] || [ "$DRY_RUN" = 1 ] || die "--ref is for --dry-run only; a push always builds origin/master"

CLI="${CONTAINER_CLI:-}"
if [ -z "$CLI" ]; then
  if command -v podman >/dev/null; then CLI=podman; else CLI=docker; fi
fi
command -v "$CLI" >/dev/null || die "no container CLI ($CLI) on PATH"

cd "$(git rev-parse --show-toplevel)"
git fetch -q origin master
REV=$(git rev-parse --verify "${REF:-origin/master}^{commit}")
SHORT=${REV::7}

CTX=$(mktemp -d)
trap 'rm -rf "$CTX"' EXIT
git archive "$REV" .devcontainer | tar -x -C "$CTX"
COMPOSE="$CTX/.devcontainer/docker-compose.yml"

IMAGE=$(sed -n 's/^  image: \(ghcr\.io\/[^ ]*-dev:[^ ]*\)$/\1/p' "$COMPOSE")
NODE_VERSION=$(sed -n "s/^      NODE_VERSION: '\([0-9.]*\)'$/\1/p" "$COMPOSE")
[ -n "$IMAGE" ] || die "no ghcr.io dev image line in .devcontainer/docker-compose.yml at $SHORT"
[ -n "$NODE_VERSION" ] || die "no NODE_VERSION build arg in .devcontainer/docker-compose.yml at $SHORT"
REPO=${IMAGE%:*}
TAG=${IMAGE##*:}
NAME=${REPO#ghcr.io/}
echo "==> $IMAGE from ${REF:-origin/master} $SHORT (Node $NODE_VERSION, $CLI)"

# --- is the tag free? -------------------------------------------------------
# Asked of the registry API rather than `$CLI manifest inspect`, whose errors
# for "absent", "present" and "not allowed to look" differ between docker and
# podman and are not reliably told apart.
if [ "$DRY_RUN" = 0 ]; then
  TOKEN="${GHCR_TOKEN:-$(gh auth token 2>/dev/null || true)}"
  [ -n "$TOKEN" ] || die "no token: set GHCR_TOKEN or log in with gh"
  USER_NAME="${GHCR_USER:-$(gh api user --jq .login 2>/dev/null || true)}"
  [ -n "$USER_NAME" ] || die "no user name: set GHCR_USER"

  # The credential goes to curl as config on stdin (printf is a builtin), so
  # the write-capable token never shows in a process list.
  bearer=$(printf 'user = "%s:%s"\n' "$USER_NAME" "$TOKEN" | curl -fsS -K - \
    "https://ghcr.io/token?service=ghcr.io&scope=repository:$NAME:pull" \
    | sed -n 's/.*"token":"\([^"]*\)".*/\1/p') \
    || die "ghcr.io refused the token (does it have write:packages?)"
  status=$(curl -sS -o /dev/null -w '%{http_code}' -I \
    -H "Authorization: Bearer $bearer" \
    -H 'Accept: application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json, application/vnd.docker.distribution.manifest.list.v2+json' \
    "https://ghcr.io/v2/$NAME/manifests/$TAG")
  case "$status" in
    404) ;;
    200) die "$IMAGE is already published. Give the changed image a new tag in .devcontainer/docker-compose.yml (node-<version>-r<n>), merge that, and run this again." ;;
    *) die "could not tell whether $IMAGE exists (HTTP $status from ghcr.io)" ;;
  esac
fi

# --- build ------------------------------------------------------------------
# --pull: the base is pinned to an exact node tag, but its Debian layer still
# takes security updates under that tag. --platform: the image is for the
# devbox, an x86-64 Linux host; pinning it means a publish from an ARM machine
# cannot leave an arm64-only image under a tag that is never overwritten.
#
# A dry run tags only :dryrun-<short>, never the compose tag: compose uses a
# local image of that name in preference to pulling, so a dry run of an
# unmerged Dockerfile would otherwise become what every stack runs.
if [ "$DRY_RUN" = 1 ]; then
  BUILT="$REPO:dryrun-$SHORT"; TAGS=(-t "$BUILT")
else
  BUILT="$IMAGE"; TAGS=(-t "$IMAGE" -t "$REPO:sha-$SHORT")
fi
"$CLI" build --pull --platform linux/amd64 \
  -f "$CTX/.devcontainer/Dockerfile" \
  --build-arg "NODE_VERSION=$NODE_VERSION" \
  --label "org.opencontainers.image.revision=$REV" \
  "${TAGS[@]}" \
  "$CTX/.devcontainer"

# --- smoke test -------------------------------------------------------------
got=$("$CLI" run --rm "$BUILT" node -p process.version)
[ "$got" = "v$NODE_VERSION" ] || die "image runs Node $got, expected v$NODE_VERSION"
"$CLI" run --rm "$BUILT" bash -c 'gh --version >/dev/null && git --version >/dev/null && nc -h 2>&1 | grep -q OpenBSD && [ "$(id -un)" = node ]' \
  || die "image is missing gh, git or netcat, or does not run as node"
echo "==> smoke test passed: Node $got"

if [ "$DRY_RUN" = 1 ]; then
  echo "==> dry run: built $BUILT locally, pushed nothing (remove it with: $CLI rmi $BUILT)"
  exit 0
fi

# --- push -------------------------------------------------------------------
printf '%s' "$TOKEN" | "$CLI" login ghcr.io -u "$USER_NAME" --password-stdin >/dev/null
# :sha-<short> first, so a failure between the two leaves the version tag
# unpublished and a rerun passes the check above and finishes both.
"$CLI" push "$REPO:sha-$SHORT"
"$CLI" push "$IMAGE"
echo "==> pushed $IMAGE and $REPO:sha-$SHORT"
echo "    A new package is private: make it public once, at"
echo "    https://github.com/orgs/blueprintnotincluded/packages/container/${NAME#*/}/settings"
