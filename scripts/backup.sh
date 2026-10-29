#!/usr/bin/env bash
set -euo pipefail
umask 077
: "${SUPABASE_DB_URL:?Set the direct or session-pooler database URL}"
: "${BACKUP_SSH_DEST:?Set an SSH destination such as backup@host:/secure/booksaga/}"
backup_dir="${BACKUP_DIR:-/var/backups/booksaga}"
mkdir -p -- "$backup_dir"
chmod 700 -- "$backup_dir"
backup_file="$backup_dir/booksaga-$(date -u +%Y%m%dT%H%M%SZ).dump"
export PGDATABASE="$SUPABASE_DB_URL"
trap 'rm -f -- "${backup_file}.partial"' EXIT
pg_dump --format=custom --no-owner --file="${backup_file}.partial"
pg_restore --list "${backup_file}.partial" >/dev/null
mv -- "${backup_file}.partial" "$backup_file"
scp -B -- "$backup_file" "$BACKUP_SSH_DEST"
find "$backup_dir" -maxdepth 1 -type f -name 'booksaga-*.dump' -mtime +56 -delete
printf 'Backup verified and copied offsite: %s\n' "$backup_file"
