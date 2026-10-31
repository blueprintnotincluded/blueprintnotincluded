#!/bin/bash
# One text report on how the box and its two compose projects have been doing,
# from what is already on the machine: the kernel log, Docker's restart
# counters and the container logs (memory-heartbeat, access, preview render,
# mongo slow queries, cloudflared reconnects, backup runs). No agent, no
# account, no new data collected — it reads the last N days and summarises.
#
#   health-report.sh [production|staging|all] [--since 7d] [--no-host]
#
#   --since   how far back to read the container logs (default 7d; docker's
#             own h/m/s units work too)
#   --no-host skip the host and container sections (used by the tests, which
#             have no docker)
#
# Run it as the deploy user before the weekly look at the site, keep the
# output next to the previous week's: the numbers mean most as a trend. The
# sections and their lines are stable so a diff reads cleanly.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
compose="$here/compose.sh"
root=${BPNI_ROOT:-/srv/bpni}

projects="production staging"
since=7d
host=1
while [ $# -gt 0 ]; do
  case "$1" in
    production|staging) projects=$1 ;;
    all) projects="production staging" ;;
    --since) since=${2:?--since needs a value}; shift ;;
    --since=*) since=${1#--since=} ;;
    --no-host) host=0 ;;
    -h|--help) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 64 ;;
  esac
  shift
done

# One number and one unit: docker logs takes Go durations (h, m, s) and
# journalctl takes "-7d". Anything else would reach docker unchanged, fail
# there, and read as an empty week (logs_of hides docker's stderr).
case "$since" in
  *[!0-9dhms]*|[!0-9]*|*[0-9]) echo "--since takes <number><d|h|m|s>, e.g. 7d or 36h; got '$since'" >&2; exit 64 ;;
esac
case "$since" in
  *d) since_docker="$(( ${since%d} * 24 ))h" ;;
  *) since_docker=$since ;;
esac

section() { printf '\n== %s ==\n' "$*"; }
line() { printf '%s\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }

# p50/p95/max of the numbers on stdin (one per line), nearest-rank: the
# p95 of four samples is the fourth, not the third.
stats() {
  sort -n | awk '
    { a[NR] = $1 }
    END {
      if (NR == 0) { print "n=0"; exit }
      i50 = int(NR * 0.5); if (i50 < NR * 0.5) i50++; if (i50 < 1) i50 = 1
      i95 = int(NR * 0.95); if (i95 < NR * 0.95) i95++; if (i95 < 1) i95 = 1
      printf "n=%d p50=%s p95=%s max=%s\n", NR, a[i50], a[i95], a[NR]
    }'
}

# "covers: from <first timestamp>, N lines". docker compose logs reads the
# container that exists now: a deploy inside the window recreated it, and
# the previous container's lines are gone with it. Every section says where
# its data actually starts rather than implying the whole window.
coverage() {
  local first
  first=$(printf '%s\n' "$1" | head -n 1 | cut -c1-19)
  line "covers: from ${first}Z, $(printf '%s\n' "$1" | grep -c . || true) lines (a container recreated by a deploy keeps only its own log)"
}

# Container log of one service, docker timestamps first on each line.
logs_of() {
  "$compose" "$1" logs --no-color --no-log-prefix -t --since "$since_docker" "$2" 2>/dev/null || true
}

report_host() {
  section "host ($(hostname 2>/dev/null || echo '?'), last $since)"
  line "now: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  have uptime && line "uptime: $(uptime | sed 's/^ *//')"
  line "kernel: $(uname -r)"
  [ -f /var/run/reboot-required ] && line "reboot-required: yes (unattended-upgrades reboots at 05:17 UTC)" || line "reboot-required: no"
  if have last; then
    line "reboots (last -x reboot, newest first):"
    last -x reboot -F 2>/dev/null | grep -E '^reboot' | head -n 5 | sed 's/^/  /' || true
  fi
  if have journalctl; then
    # -k alone is the current boot only; -b all spans the reboots in the
    # window. One "Out of memory: Killed process" line per victim, where the
    # oom-kill and oom_reaper lines would count the same event twice.
    oom=$(journalctl -k -b all --since "-$since" --no-pager 2>/dev/null | grep -ci 'Out of memory: Killed process' || true)
    line "kernel OOM kills in window: ${oom:-0}"
  fi
  if [ -r /var/log/unattended-upgrades/unattended-upgrades.log ]; then
    line "unattended-upgrades (last 3 lines):"
    tail -n 3 /var/log/unattended-upgrades/unattended-upgrades.log | sed 's/^/  /'
  fi
  have free && { line "memory (MB):"; free -m | sed 's/^/  /'; }
  have df && { line "disk:"; df -h / "$root/dumps" 2>/dev/null | sed 's/^/  /'; }
}

report_containers() {
  section "containers"
  if ! have docker; then line "docker: not found"; return; fi
  local all names
  if ! all=$(docker ps -a --format '{{.Names}}' 2>&1); then
    line "docker ps failed: $all"
    return
  fi
  names=$(printf '%s\n' "$all" | grep -E '^(production|staging)[-_]' || true)
  if [ -z "$names" ]; then line "no production/staging containers"; return; fi
  # RestartCount is since the container was created (a deploy recreates it),
  # StartedAt is the last start: both together date a crash loop or a reboot.
  for n in $names; do
    docker inspect --format \
      '{{.Name}} status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}-{{end}} restarts={{.RestartCount}} started={{.State.StartedAt}} oomKilled={{.State.OOMKilled}} exitCode={{.State.ExitCode}}' \
      "$n" 2>/dev/null | sed 's|^/||' || true
  done
  line "usage now (docker stats):"
  docker stats --no-stream --format '  {{.Name}} mem={{.MemUsage}} ({{.MemPerc}}) cpu={{.CPUPerc}}' $names 2>/dev/null || true
}

report_app() {
  local project=$1 log
  log=$(logs_of "$project" app)
  section "$project app (last $since)"
  if [ -z "$log" ]; then line "no log lines"; return; fi
  coverage "$log"

  # Boots: one line per process start, timestamps are docker's.
  line "boots: $(printf '%s\n' "$log" | grep -c 'listening on port' || true)"
  printf '%s\n' "$log" | grep 'listening on port' | awk '{print "  " substr($1, 1, 19) "Z"}' || true

  line "memory-heartbeat (rss MB first → last, max; heapUsed max):"
  printf '%s\n' "$log" | awk '
    /memory-heartbeat:/ {
      label = $3; rss = ""; heap = ""
      for (i = 4; i <= NF; i++) {
        if (index($i, "rss=") == 1) rss = substr($i, 5) + 0
        if (index($i, "heapUsed=") == 1) heap = substr($i, 10) + 0
      }
      if (!(label in first)) first[label] = rss
      last[label] = rss
      if (rss > max[label]) max[label] = rss
      if (heap > hmax[label]) hmax[label] = heap
      n[label]++; seen++
    }
    END {
      # seen, not length(n): on an empty log gawk types the untouched n as a
      # scalar at length(n) and then refuses "for (l in n)"; mawk lets it pass,
      # which is how the test went green here and red in CI.
      if (seen == 0) { print "  none"; exit }
      for (l in n) printf "  %s: rss %d → %d MB, max %d MB; heapUsed max %d MB (%d samples)\n", l, first[l], last[l], max[l], hmax[l], n[l]
    }'

  local access
  access=$(printf '%s\n' "$log" | grep ' access: ' || true)
  if [ -z "$access" ]; then
    line "access: no lines (image predates the access log, or ACCESS_LOG=off)"
  else
    line "access: $(printf '%s\n' "$access" | wc -l | tr -d ' ') logged requests (static files and the healthcheck are only logged when failed or slow)"
    line "  by status: $(printf '%s\n' "$access" | awk '{ for (i = 1; i <= NF; i++) if (index($i, "status=") == 1) c[substr($i, 8, 1) "xx"]++ } END { for (k in c) printf "%s=%d ", k, c[k] }')"
    line "  ms: $(printf '%s\n' "$access" | awk '{ for (i = 1; i <= NF; i++) if (index($i, "ms=") == 1) print substr($i, 4) }' | stats)"
    line "  routes (count, p50 ms):"
    printf '%s\n' "$access" | awk '
      { r = ""; ms = ""
        for (i = 1; i <= NF; i++) { if (index($i, "route=") == 1) r = substr($i, 7); if (index($i, "ms=") == 1) ms = substr($i, 4) + 0 }
        n[r]++; v[r] = v[r] " " ms }
      END { for (r in n) print n[r], r, v[r] }' | sort -rn | awk 'NR <= 8' | while read -r count route rest; do
        p50=$(printf '%s\n' $rest | sort -n | awk '{ a[NR] = $1 } END { i = int(NR * 0.5); if (i < NR * 0.5) i++; if (i < 1) i = 1; print a[i] }')
        line "    $count $route p50=${p50}ms"
      done
    line "  countries: $(printf '%s\n' "$access" | awk '{ for (i = 1; i <= NF; i++) if (index($i, "country=") == 1) c[substr($i, 9)]++ } END { for (k in c) print c[k], k }' | sort -rn | awk 'NR <= 8 { printf "%s=%s ", $2, $1 }')"
    line "  slowest:"
    printf '%s\n' "$access" | awk '
      { ms = 0; for (i = 1; i <= NF; i++) if (index($i, "ms=") == 1) ms = substr($i, 4) + 0
        print ms, substr($1, 1, 19) "Z", $0 }' | sort -rn | awk 'NR <= 5 { printf "    %sms %s", $1, $2; for (i = 5; i <= NF; i++) if ($i ~ /^(method|route|status|url)=/) printf " %s", $i; print "" }'
    line "  5xx:"
    printf '%s\n' "$access" | grep -E ' status=5[0-9][0-9] ' | tail -n 5 | sed 's/^/    /' || line "    none"
  fi

  line "preview renders: $(printf '%s\n' "$log" | grep -c 'preview render .*total=' || true) (cold: $(printf '%s\n' "$log" | grep 'preview render .*total=' | grep -c '(cold)' || true)); total ms: $(printf '%s\n' "$log" | grep 'preview render .*total=' | sed -n 's/.* total=\([0-9]*\)ms.*/\1/p' | stats)"
  line "preview queue full: $(printf '%s\n' "$log" | grep -c 'render queue full' || true); worker exits: $(printf '%s\n' "$log" | grep -c 'render worker exited' || true)"
  printf '%s\n' "$log" | grep 'render worker exited' | tail -n 3 | sed 's/^/  /' || true
  line "facets-slow: $(printf '%s\n' "$log" | grep -c 'facets-slow' || true)"
  line "error lines: $(printf '%s\n' "$log" | grep -ciE '\berror\b|unhandled|ECONNRESET|EPIPE' || true) (last 3):"
  printf '%s\n' "$log" | grep -iE '\berror\b|unhandled|ECONNRESET|EPIPE' | tail -n 3 | cut -c1-200 | sed 's/^/  /' || true
}

report_mongo() {
  local project=$1 log
  log=$(logs_of "$project" mongo)
  section "$project mongo (last $since)"
  if [ -z "$log" ]; then line "no log lines"; return; fi
  coverage "$log"
  line "starts: $(printf '%s\n' "$log" | grep -c 'Waiting for connections' || true)"
  local slow
  slow=$(printf '%s\n' "$log" | grep 'Slow query' || true)
  line "slow queries (over mongod's 100 ms default): $(printf '%s\n' "$slow" | grep -c . || true)"
  if [ -n "$slow" ]; then
    line "  durationMillis: $(printf '%s\n' "$slow" | sed -n 's/.*"durationMillis":\([0-9]*\).*/\1/p' | stats)"
    line "  by namespace:"
    printf '%s\n' "$slow" | sed -n 's/.*"ns":"\([^"]*\)".*/\1/p' | sort | uniq -c | sort -rn | awk 'NR <= 5 { print "    " $0 }'
  fi
  line "connection/election/storage warnings: $(printf '%s\n' "$log" | grep -ciE '"s":"(W|E|F)"' || true)"
}

report_cloudflared() {
  local project=$1 log
  log=$(logs_of "$project" cloudflared)
  section "$project cloudflared (last $since)"
  if [ -z "$log" ]; then line "no log lines"; return; fi
  coverage "$log"
  line "tunnel connections registered: $(printf '%s\n' "$log" | grep -c 'Registered tunnel connection' || true) (4 per connector start is normal)"
  local trouble
  trouble=$(printf '%s\n' "$log" | grep -iE 'Unregistered tunnel connection|failed|lost connection|retrying|ERR' || true)
  line "reconnects/errors: $(printf '%s\n' "$trouble" | grep -c . || true) (last 3):"
  printf '%s\n' "$trouble" | tail -n 3 | cut -c1-200 | sed 's/^/  /' || true
}

report_backup() {
  local project=$1 log
  log=$(logs_of "$project" backup)
  section "$project backup (last $since)"
  if [ -z "$log" ]; then line "no log lines (profile not enabled, or no run yet)"; return; fi
  coverage "$log"
  line "runs completed: $(printf '%s\n' "$log" | grep -c 'backup: done' || true)"
  printf '%s\n' "$log" | grep 'backup: done' | tail -n 3 | sed 's/^/  /' || true
  line "failures: $(printf '%s\n' "$log" | grep -ciE 'fail|error|No such|denied' || true)"
  printf '%s\n' "$log" | grep -iE 'fail|error|No such|denied' | tail -n 3 | cut -c1-200 | sed 's/^/  /' || true
  line "bucket total (last reported):"
  printf '%s\n' "$log" | grep -E 'Total (objects|size)' | tail -n 2 | sed 's/^/  /' || true
}

line "bpni health report — $(date -u +%Y-%m-%d) — projects: $projects — window: $since"
if [ "$host" = 1 ]; then
  report_host
  report_containers
fi
for p in $projects; do
  report_app "$p"
  report_mongo "$p"
  report_cloudflared "$p"
  if [ "$p" = production ]; then report_backup "$p"; fi
done
