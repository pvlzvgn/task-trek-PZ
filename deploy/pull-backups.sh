#!/bin/bash
# Забор бэкапов с VPS на Mac (запускается launchd раз в день).
# Если VPN выключен и сервер недоступен — тихо выходим, попробуем завтра.
DEST="$HOME/TaskTrekBackups"
mkdir -p "$DEST"
rsync -az --timeout=20 \
  -e "ssh -i $HOME/.ssh/tasktrek_deploy -o BatchMode=yes -o ConnectTimeout=10" \
  root@85.239.41.8:/opt/tasktrek/backups/ "$DEST/" 2>/dev/null \
  && echo "$(date '+%F %T') бэкапы синхронизированы в $DEST" \
  || echo "$(date '+%F %T') сервер недоступен (VPN?), пропуск"
