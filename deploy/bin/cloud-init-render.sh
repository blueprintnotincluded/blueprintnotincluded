#!/bin/bash
# LAPTOP. Fill deploy/cloud-init.yaml with this machine's SSH public key and the
# GitHub Actions deploy key, ready for the "Cloud config" box when creating the
# Hetzner server.
#
#   deploy/bin/cloud-init-render.sh [output]      # default /tmp/bpni-cloud-init.yaml
#
# Keys: SSH_PUBLIC_KEY (default: ~/.ssh/id_ed25519.pub, else ~/.ssh/id_rsa.pub —
# the key your ssh client offers) and DEPLOY_KEY (default ~/.ssh/bpni-deploy;
# generated when missing — its private half becomes the DEPLOY_SSH_KEY
# repository secret). Stops instead of writing an empty or non-public key, and
# copies the result to the clipboard when pbcopy, wl-copy or xclip exists.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
template=$here/../cloud-init.yaml
out=${1:-/tmp/bpni-cloud-init.yaml}
deploy_key=${DEPLOY_KEY:-$HOME/.ssh/bpni-deploy}

if [ -z "${SSH_PUBLIC_KEY:-}" ]; then
  for c in "$HOME/.ssh/id_ed25519.pub" "$HOME/.ssh/id_rsa.pub"; do
    [ -f "$c" ] && { SSH_PUBLIC_KEY=$c; break; }
  done
fi
[ -n "${SSH_PUBLIC_KEY:-}" ] && [ -f "$SSH_PUBLIC_KEY" ] || {
  echo "no SSH public key found; set SSH_PUBLIC_KEY=/path/to/key.pub" >&2; exit 66; }
[ -f "$deploy_key.pub" ] || ssh-keygen -t ed25519 -f "$deploy_key" -C github-actions-deploy -N ''

# fill <placeholder> <key file>: the placeholder must occur exactly once.
rendered=$(<"$template")
fill() {
  local key count
  key=$(tr -d '\n' <"$2")
  # ssh-keygen -l parses the key for real; a prefix check would pass garbage
  # after the key type and lock the box (password login is off).
  ssh-keygen -lf "$2" >/dev/null 2>&1 || { echo "$2 is not an SSH public key" >&2; exit 65; }
  count=$(grep -cF -- "$1" "$template" || true)
  [ "$count" = 1 ] || { echo "placeholder not found exactly once in $template: $1" >&2; exit 70; }
  rendered=${rendered//"$1"/$key}
}
fill 'ssh-ed25519 AAAA... kevin@laptop' "$SSH_PUBLIC_KEY"
fill 'ssh-ed25519 AAAA... github-actions-deploy' "$deploy_key.pub"
printf '%s\n' "$rendered" >"$out"

echo "== $out — the two keys the box will accept:"
grep -A2 -- 'ssh_authorized_keys' "$out"
for clip in pbcopy wl-copy xclip; do
  if command -v "$clip" >/dev/null 2>&1; then
    case $clip in xclip) xclip -selection clipboard <"$out" ;; *) "$clip" <"$out" ;; esac
    echo "== copied to the clipboard: paste into Hetzner → Create server → Cloud config"
    break
  fi
done
echo "== in Hetzner's SSH key picker add $SSH_PUBLIC_KEY (not the deploy key)"
