#!/usr/bin/env bash
# =============================================================================
# Electrica Ventas CRM — Creación de base de datos y ejecución de migraciones
# Uso: ./create_db.sh
# Se debe ejecutar con un usuario de PostgreSQL que tenga privilegios de SUPERUSER
# (típicamente 'postgres').
# Variables de entorno requeridas:
#   DB_HOST, DB_PORT, DB_SUPERUSER, DB_NAME, APP_USER, APP_PASSWORD
#   MIGRATIONS_DIR (por defecto: directorio padre del script + /migrations)
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuración
# ---------------------------------------------------------------------------
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_SUPERUSER="${DB_SUPERUSER:-postgres}"
DB_NAME="${DB_NAME:-electrica_ventas}"
APP_USER="${APP_USER:-electrica_app}"
APP_PASSWORD="${APP_PASSWORD:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-${SCRIPT_DIR}/../migrations}"

# ---------------------------------------------------------------------------
# Validaciones
# ---------------------------------------------------------------------------
if [[ -z "${APP_PASSWORD}" ]]; then
    echo "[ERROR] La variable APP_PASSWORD es obligatoria." >&2
    exit 1
fi

if [[ ! -d "${MIGRATIONS_DIR}" ]]; then
    echo "[ERROR] No se encontró el directorio de migraciones: ${MIGRATIONS_DIR}" >&2
    exit 1
fi

run_as_super() {
    PGPASSWORD="${SUPER_PASSWORD:-}" psql \
        --host="${DB_HOST}" \
        --port="${DB_PORT}" \
        --username="${DB_SUPERUSER}" \
        --dbname="postgres" \
        --no-password \
        "$@"
}

run_migration() {
    local file="$1"
    PGPASSWORD="${APP_PASSWORD}" psql \
        --host="${DB_HOST}" \
        --port="${DB_PORT}" \
        --username="${APP_USER}" \
        --dbname="${DB_NAME}" \
        --set ON_ERROR_STOP=1 \
        --file="${file}"
}

echo "================================================================"
echo " Electrica Ventas CRM — Setup de base de datos"
echo " Host: ${DB_HOST}:${DB_PORT}"
echo " Base de datos: ${DB_NAME}"
echo " Usuario de app: ${APP_USER}"
echo "================================================================"

# ---------------------------------------------------------------------------
# 1. Crear rol de aplicación si no existe
# ---------------------------------------------------------------------------
echo ""
echo "[1/4] Creando rol '${APP_USER}'..."
run_as_super --command="
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${APP_USER}') THEN
        CREATE ROLE ${APP_USER}
            WITH LOGIN
            PASSWORD '${APP_PASSWORD}'
            NOSUPERUSER
            NOCREATEDB
            NOCREATEROLE;
        RAISE NOTICE 'Rol % creado.', '${APP_USER}';
    ELSE
        ALTER ROLE ${APP_USER} WITH PASSWORD '${APP_PASSWORD}';
        RAISE NOTICE 'Rol % ya existía. Contraseña actualizada.', '${APP_USER}';
    END IF;
END
\$\$;
"

# ---------------------------------------------------------------------------
# 2. Crear base de datos si no existe
# ---------------------------------------------------------------------------
echo ""
echo "[2/4] Creando base de datos '${DB_NAME}'..."
DB_EXISTS=$(run_as_super --tuples-only --command="SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}';" | tr -d ' \n')

if [[ "${DB_EXISTS}" == "1" ]]; then
    echo "       Base de datos '${DB_NAME}' ya existe. Se omite creación."
else
    run_as_super --command="
        CREATE DATABASE ${DB_NAME}
            WITH OWNER = ${APP_USER}
            ENCODING = 'UTF8'
            LC_COLLATE = 'es_MX.UTF-8'
            LC_CTYPE = 'es_MX.UTF-8'
            TEMPLATE = template0;
    " 2>/dev/null || \
    run_as_super --command="
        CREATE DATABASE ${DB_NAME}
            WITH OWNER = ${APP_USER}
            ENCODING = 'UTF8'
            TEMPLATE = template0;
    "
    echo "       Base de datos '${DB_NAME}' creada."
fi

# ---------------------------------------------------------------------------
# 3. Otorgar privilegios al usuario de app
# ---------------------------------------------------------------------------
echo ""
echo "[3/4] Configurando privilegios..."
run_as_super --command="
GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${APP_USER};
" 2>/dev/null || true

# Necesitamos conectarnos a la DB destino para configurar el schema
PGPASSWORD="${SUPER_PASSWORD:-}" psql \
    --host="${DB_HOST}" \
    --port="${DB_PORT}" \
    --username="${DB_SUPERUSER}" \
    --dbname="${DB_NAME}" \
    --command="
GRANT ALL ON SCHEMA public TO ${APP_USER};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${APP_USER};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${APP_USER};
" 2>/dev/null || true

# ---------------------------------------------------------------------------
# 4. Ejecutar migraciones en orden
# ---------------------------------------------------------------------------
echo ""
echo "[4/4] Ejecutando migraciones..."

MIGRATIONS=$(find "${MIGRATIONS_DIR}" -name "*.sql" -type f | sort)

if [[ -z "${MIGRATIONS}" ]]; then
    echo "[WARN] No se encontraron archivos .sql en ${MIGRATIONS_DIR}"
else
    for migration_file in ${MIGRATIONS}; do
        migration_name=$(basename "${migration_file}")
        echo "       -> Aplicando: ${migration_name}"
        run_migration "${migration_file}"
        echo "          OK: ${migration_name}"
    done
fi

# ---------------------------------------------------------------------------
# Verificación final
# ---------------------------------------------------------------------------
echo ""
echo "================================================================"
echo " Setup completado exitosamente."
echo " Tablas creadas en '${DB_NAME}':"
PGPASSWORD="${APP_PASSWORD}" psql \
    --host="${DB_HOST}" \
    --port="${DB_PORT}" \
    --username="${APP_USER}" \
    --dbname="${DB_NAME}" \
    --tuples-only \
    --command="SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;" \
| sed 's/^/   -/'
echo "================================================================"
