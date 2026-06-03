#!/usr/bin/env bash
# =============================================================================
# Electrica Ventas CRM — Backup PostgreSQL
# Uso: ./backup.sh
# Variables de entorno requeridas (o configuradas abajo):
#   DB_HOST, DB_PORT, DB_NAME, DB_USER, BACKUP_DIR
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuración (puede sobreescribirse con variables de entorno)
# ---------------------------------------------------------------------------
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-electrica_ventas}"
DB_USER="${DB_USER:-electrica_app}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/electrica-ventas}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

# ---------------------------------------------------------------------------
# Preparación
# ---------------------------------------------------------------------------
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/electrica_ventas_${TIMESTAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Iniciando backup de ${DB_NAME}..."
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Destino: ${BACKUP_FILE}"

# ---------------------------------------------------------------------------
# pg_dump + compresión
# ---------------------------------------------------------------------------
PGPASSWORD="${DB_PASSWORD:-}" pg_dump \
    --host="${DB_HOST}" \
    --port="${DB_PORT}" \
    --username="${DB_USER}" \
    --format=plain \
    --no-owner \
    --no-acl \
    --encoding=UTF8 \
    "${DB_NAME}" \
| gzip -9 > "${BACKUP_FILE}"

BACKUP_SIZE=$(du -sh "${BACKUP_FILE}" | cut -f1)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup completado. Tamaño: ${BACKUP_SIZE}"

# ---------------------------------------------------------------------------
# Retención: eliminar backups más antiguos que RETENTION_DAYS
# ---------------------------------------------------------------------------
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Eliminando backups con más de ${RETENTION_DAYS} días..."
find "${BACKUP_DIR}" \
    -name "electrica_ventas_*.sql.gz" \
    -type f \
    -mtime "+${RETENTION_DAYS}" \
    -delete \
    -print | while read -r archivo; do
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] Eliminado: ${archivo}"
    done

# ---------------------------------------------------------------------------
# Resumen de backups existentes
# ---------------------------------------------------------------------------
TOTAL=$(find "${BACKUP_DIR}" -name "electrica_ventas_*.sql.gz" -type f | wc -l | tr -d ' ')
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backups disponibles: ${TOTAL}"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup finalizado correctamente."
