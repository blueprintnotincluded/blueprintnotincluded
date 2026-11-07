#!/bin/bash
# The weekly proof that the backups restore, with a heartbeat only when they do.
#
#   drill-weekly.sh            # what the deploy user's crontab runs, Sundays 05:00 UTC
#
# Runs bin/restore-drill.sh production against the newest daily archive; on the
# first Sunday of the month (when backup.sh has just written a monthly/ archive;
# a hand run on a weekday never restores the 4.5 GB monthly under daytime load)
# also against the newest monthly, with the wider DRILL_MONTHLY_TOLERANCE_PERCENT
# (default 20) since that archive can be weeks old when the morning's dump
# failed. Then checks the root disk (fails above DRILL_DISK_MAX_PERCENT, 85) and
# pings DRILL_HEARTBEAT_URL from /srv/bpni/production/.env — only when every
# step passed. The heartbeat is a dead-man's switch: the alert is the ping not
# arriving, so a failed drill, a full disk and a box that is off all alert the
# same way. Unset URL: no ping, nothing else changes (the drill still runs).
#
# Output goes to $BPNI_ROOT/drill-weekly.log, and to the terminal as well when
# run by hand; the log is trimmed to its last 2000 lines at every start. Exit
# status is the verdict. Installed in the crontab by bin/deploy.sh.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
root=${BPNI_ROOT:-/srv/bpni}
project=production
envfile="$root/$project/.env"
log="$root/drill-weekly.log"
disk_max=${DRILL_DISK_MAX_PERCENT:-85}
monthly_tolerance=${DRILL_MONTHLY_TOLERANCE_PERCENT:-20}

if [ -f "$log" ]; then
  tail -n 2000 "$log" > "$log.tmp" && mv "$log.tmp" "$log"
fi
if [ -t 1 ]; then exec > >(tee -a "$log") 2>&1; else exec >> "$log" 2>&1; fi

echo "==== drill-weekly $(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Same reader as restore-drill.sh: empty for a missing key, fatal for an
# unreadable file (logged above, since the log is open by now).
getenv() {
  local out
  out=$(grep -E "^$1=" "$envfile") || [ $? -eq 1 ] || { echo "drill-weekly: cannot read $envfile, FAILED" >&2; exit 66; }
  printf '%s\n' "$out" | tail -n1 | cut -d= -f2- | tr -d '"'
}
heartbeat=$(getenv DRILL_HEARTBEAT_URL)
[[ "$disk_max" =~ ^[0-9]+$ ]] || { echo "drill-weekly: DRILL_DISK_MAX_PERCENT must be a number, FAILED" >&2; exit 64; }
status=0

"$here/restore-drill.sh" "$project" daily || { echo "drill-weekly: daily drill failed" >&2; status=1; }

if [ "$status" = 0 ] && [ "$(date -u +%u)" = 7 ] && [ "$(date -u +%d)" -le 7 ]; then
  echo "==== first Sunday: monthly archive too (tolerance ${monthly_tolerance}%)"
  DRILL_TOLERANCE_PERCENT="$monthly_tolerance" "$here/restore-drill.sh" "$project" monthly \
    || { echo "drill-weekly: monthly drill failed" >&2; status=1; }
fi

used=$(df --output=pcent / 2>/dev/null | tail -n1 | tr -dc '0-9') || used=""
if [ -z "$used" ]; then
  echo "drill-weekly: could not read root disk usage" >&2; status=1
elif [ "$used" -gt "$disk_max" ]; then
  echo "drill-weekly: root disk ${used}% used, over ${disk_max}%" >&2; status=1
else
  echo "==== root disk ${used}% used (limit ${disk_max}%)"
fi

if [ "$status" = 0 ]; then
  echo "==== drill-weekly PASSED"
  if [ -n "$heartbeat" ]; then
    curl -fsS -m 10 --retry 3 -o /dev/null "$heartbeat" \
      || echo "drill-weekly: heartbeat ping failed" >&2
  fi
else
  echo "==== drill-weekly FAILED (no heartbeat sent)" >&2
fi
exit "$status"
