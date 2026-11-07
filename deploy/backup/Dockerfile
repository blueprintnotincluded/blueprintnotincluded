# Backup sidecar: MongoDB Database Tools + rclone on Alpine, driven by crond.
#
# Built on the server by compose (`build:` in compose.yml) — it is tiny and
# changes rarely, so it is not worth a registry round trip. The same image is
# what bin/seed-from-dump.sh and bin/restore-drill.sh run their one-off
# mongodump / mongorestore / rclone commands in, so the host needs none of
# those installed. Archives are streamed to and from R2 and never written to a
# disk, here or on the host.
FROM alpine:3.22

# curl: the success ping to BACKUP_HEARTBEAT_URL at the end of backup.sh.
RUN apk add --no-cache mongodb-tools rclone bash coreutils curl tini ca-certificates

# Empty on purpose: the remote comes from RCLONE_CONFIG_R2_* in the
# environment, and an existing (empty) config file keeps rclone from logging a
# NOTICE about a missing one on every call.
RUN touch /etc/rclone.conf

COPY entrypoint.sh backup.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/entrypoint.sh /usr/local/bin/backup.sh

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/entrypoint.sh"]
