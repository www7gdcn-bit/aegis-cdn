#!/usr/bin/env bash
# AegisCDN 数据备份:PostgreSQL(业务/配置)+ ClickHouse(攻击日志)。
# 建议 crontab 每日执行:0 3 * * * /opt/aegis/deploy/backup.sh >> /var/log/aegis-backup.log 2>&1
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/aegis}"
KEEP_DAYS="${KEEP_DAYS:-14}"
TS="$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

# --- PostgreSQL ---
# 用 docker compose 部署时:docker compose exec -T postgres pg_dump ...
PG_CONTAINER="${PG_CONTAINER:-aegis-cdn-postgres-1}"
echo "[backup] pg_dump → $BACKUP_DIR/pg_$TS.sql.gz"
docker exec "$PG_CONTAINER" pg_dump -U aegis aegis | gzip > "$BACKUP_DIR/pg_$TS.sql.gz"

# --- ClickHouse(攻击/访问日志,体量大,按需)---
CH_HTTP="${CLICKHOUSE_URL:-http://localhost:8123}"
echo "[backup] clickhouse request_log → $BACKUP_DIR/ch_request_log_$TS.tsv.gz"
curl -s "${CH_HTTP}/?query=SELECT%20*%20FROM%20aegis.request_log%20FORMAT%20TSVWithNames" \
  | gzip > "$BACKUP_DIR/ch_request_log_$TS.tsv.gz" || echo "[backup] clickhouse 跳过(不可达)"

# --- 清理过期 ---
find "$BACKUP_DIR" -type f -mtime +"$KEEP_DAYS" -delete
echo "[backup] done. kept ${KEEP_DAYS}d in $BACKUP_DIR"

# 强烈建议:把 $BACKUP_DIR 同步到异地对象存储(S3/OSS)。
