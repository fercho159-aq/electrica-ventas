#!/usr/bin/env bash
# =============================================================================
# Electrica Ventas CRM — Restore PostgreSQL
# Uso:
#   ./restore.sh               → restaura el backup más reciente
#   ./restore.sh 20241201      → restaura el primer backup del 2024-12-01
#   ./restore.sh 20241201_1430 → restaura backup específico por timestamp
# Variables de entorno requeridas (o configuradas abajo):
#   DB_HOST, DB_PORT, DB_NAME, DB_USER, BACKUP_DIR
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuración
# ---------------------------------------------------------------------------
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-electrica_ventas}"
DB_USER="${DB_USER:-electrica_app}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/electrica-ventas}"
DATE_FILTER="${1:-}"

# ---------------------------------------------------------------------------
# Selección del archivo de backup
# ---------------------------------------------------------------------------
if [[ -z "${DATE_FILTER}" ]]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Buscando el backup más reciente..."
    BACKUP_FILE=$(find "${BACKUP_DIR}" \
        -name "electrica_ventas_*.sql.gz" \
        -type f \
        | sort \
        | tail -n 1)
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Buscando backup con filtro: ${DATE_FILTER}"
    BACKUP_FILE=$(find "${BACKUP_DIR}" \
        -name "electrica_ventas_${DATE_FILTER}*.sql.gz" \
        -type f \
        | sort \
        | tail -n 1)
fi

if [[ -z "${BACKUP_FILE}" ]]; then
    echo "[ERROR] No se encontró ningún archivo de backup en ${BACKUP_DIR}" >&2
    exit 1
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Archivo seleccionado: ${BACKUP_FILE}"
BACKUP_SIZE=$(du -sh "${BACKUP_FILE}" | cut -f1)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Tamaño del backup: ${BACKUP_SIZE}"

# ---------------------------------------------------------------------------
# Confirmación de seguridad
# ---------------------------------------------------------------------------
echo ""
echo "  ADVERTENCIA: Se va a restaurar la base de datos '${DB_NAME}' en ${DB_HOST}:${DB_PORT}."
echo "  Esto sobreescribirá todos los datos actuales."
echo ""
read -r -p "  ¿Confirmar restauración? [s/N]: " CONFIRMACION

if [[ "${CONFIRMACION}" != "s" && "${CONFIRMACION}" != "S" ]]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Restauración cancelada por el usuario."
    exit 0
fi

# ---------------------------------------------------------------------------
# Terminar conexiones activas
# ---------------------------------------------------------------------------
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Terminando conexiones activas a ${DB_NAME}..."
PGPASSWORD="${DB_PASSWORD:-}" psql \
    --host="${DB_HOST}" \
    --port="${DB_PORT}" \
    --username="${DB_USER}" \
    --dbname="postgres" \
    --command="SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();" \
    > /dev/null

# ---------------------------------------------------------------------------
# Restaurar
# ---------------------------------------------------------------------------
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Iniciando restauración..."

gunzip -c "${BACKUP_FILE}" | PGPASSWORD="${DB_PASSWORD:-}" psql \
    --host="${DB_HOST}" \
    --port="${DB_PORT}" \
    --username="${DB_USER}" \
    --dbname="${DB_NAME}" \
    --set ON_ERROR_STOP=1

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Restauración completada correctamente desde: ${BACKUP_FILE}"
