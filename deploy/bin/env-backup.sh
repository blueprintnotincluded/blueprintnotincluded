#!/bin/bash
# An encrypted copy of the four env files, kept off the box, so a dead server is
# rebuilt from cloud-init + this archive + the nightly R2 dump instead of by
# collecting every secret again from Cloudflare, Mailjet, WorkOS and the old
# DigitalOcean notes.
#
#   env-backup.sh backup                   # writes $BPNI_ROOT/dumps/env-<stamp>.tar.enc
#   env-backup.sh restore <archive>        # recreates the four files, mode 600
#
# AES-256-CBC with PBKDF2 (openssl, present on the box and on a Mac). The
# passphrase is read from the terminal, or from ENV_BACKUP_PASSPHRASE for
# scripts and tests; it is never an argument. Keep the passphrase in your
# password manager next to the archive — one is useless without the other, so
# the archive can live anywhere (laptop, the password manager's file store).
# Restore refuses to overwrite an existing env file (exit 73). Run as deploy.
set -euo pipefail

root=${BPNI_ROOT:-/srv/bpni}
dumps=$root/dumps
files=(production/.env production/app.env staging/.env staging/app.env)
mode=${1:?usage: env-backup.sh backup | restore <archive>}

passphrase() { # into ENV_BACKUP_PASSPHRASE, confirmed when creating
  if [ -z "${ENV_BACKUP_PASSPHRASE:-}" ]; then
    [ -t 0 ] || { echo "no passphrase: set ENV_BACKUP_PASSPHRASE or run from a terminal" >&2; exit 65; }
    read -rsp 'passphrase: ' ENV_BACKUP_PASSPHRASE; echo >&2
    if [ "$1" = confirm ]; then
      local again; read -rsp 'again: ' again; echo >&2
      [ "$ENV_BACKUP_PASSPHRASE" = "$again" ] || { echo "passphrases differ" >&2; exit 65; }
    fi
  fi
  [ -n "$ENV_BACKUP_PASSPHRASE" ] || { echo "empty passphrase" >&2; exit 65; }
  export ENV_BACKUP_PASSPHRASE
}

case "$mode" in
  backup)
    for f in "${files[@]}"; do
      [ -f "$root/$f" ] || { echo "$root/$f is missing" >&2; exit 66; }
    done
    passphrase confirm
    mkdir -p "$dumps"
    out="$dumps/env-$(date -u +%Y%m%dT%H%M%SZ).tar.enc"
    ( umask 077; tar -C "$root" -cz -- "${files[@]}" |
        openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:ENV_BACKUP_PASSPHRASE -out "$out" )
    ls -l "$out"
    echo "== copy it off the box, e.g. from your laptop:"
    echo "   scp deploy@$(hostname -I 2>/dev/null | awk '{print $1}'):$out ."
    ;;
  restore)
    archive=${2:?usage: env-backup.sh restore <archive>}
    [ -f "$archive" ] || { echo "$archive not found" >&2; exit 66; }
    for f in "${files[@]}"; do
      [ -e "$root/$f" ] && { echo "$root/$f exists, not touching it" >&2; exit 73; }
    done
    passphrase
    mkdir -p "$root/production" "$root/staging"
    openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:ENV_BACKUP_PASSPHRASE -in "$archive" |
      tar -C "$root" -xz -- "${files[@]}"
    chmod 600 "${files[@]/#/$root/}"
    echo "== restored:"; for f in "${files[@]}"; do ls -l "$root/$f"; done
    ;;
  *) echo "mode must be backup or restore" >&2; exit 64 ;;
esac
