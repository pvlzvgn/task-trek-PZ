#!/bin/bash
# Ежедневный бэкап БД Task Trek (запускается кроном на VPS).
# Онлайн-копия через better-sqlite3 (безопасно при работающем приложении),
# затем gzip с датой и ротация: храним 30 дней.
set -euo pipefail

cd /opt/tasktrek
BACKUP_DIR=/opt/tasktrek/backups
VOL=$(docker volume inspect tasktrek_tracker-data -f '{{.Mountpoint}}')
STAMP=$(date +%F)

mkdir -p "$BACKUP_DIR"

docker compose exec -T api node -e "
const Database = require('better-sqlite3');
const db = new Database('/app/server/data/tracker.db', { readonly: true });
db.backup('/app/server/data/backup-tmp.db')
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
"

mv "$VOL/backup-tmp.db" "$BACKUP_DIR/tracker-$STAMP.db"
gzip -f "$BACKUP_DIR/tracker-$STAMP.db"
find "$BACKUP_DIR" -name 'tracker-*.db.gz' -mtime +30 -delete

echo "$(date '+%F %T') бэкап tracker-$STAMP.db.gz готов ($(du -h "$BACKUP_DIR/tracker-$STAMP.db.gz" | cut -f1))"
