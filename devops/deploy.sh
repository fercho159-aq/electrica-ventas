#!/usr/bin/env bash
# =============================================================================
# Electrica Ventas - Script de deploy
# Uso: bash devops/deploy.sh [--branch main]
# Requiere: git, node, npm, pm2 instalados y configurados
# =============================================================================
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[+]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# --- Directorio raíz del proyecto ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BRANCH="${1:-main}"
TIMESTAMP=$(date +"%Y-%m-%d %H:%M:%S")

log "=== Deploy Electrica Ventas — $TIMESTAMP ==="
log "Proyecto: $PROJECT_ROOT"
log "Branch:   $BRANCH"

cd "$PROJECT_ROOT"

# --- Verificar que no hay cambios locales sin commitear ---
if [[ -n "$(git status --porcelain)" ]]; then
    warn "Hay cambios locales sin commitear:"
    git status --short
    read -r -p "¿Continuar de todas formas? [y/N] " CONFIRM
    [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]] && err "Deploy cancelado."
fi

# =============================================================================
# 1. Git pull
# =============================================================================
log "Haciendo git pull origin $BRANCH..."
git fetch origin
git checkout "$BRANCH"
git pull origin "$BRANCH"
log "Código actualizado. Commit actual: $(git rev-parse --short HEAD)"

# =============================================================================
# 2. Instalar dependencias del backend
# =============================================================================
log "Instalando dependencias (npm ci)..."
npm ci --prefix backend --omit=dev
log "Dependencias instaladas."

# =============================================================================
# 3. Compilar TypeScript
# =============================================================================
log "Compilando TypeScript..."
npm run build --prefix backend
log "Build completado en backend/dist/"

# =============================================================================
# 4. Ejecutar migraciones de base de datos (si existen)
# =============================================================================
if [[ -f "backend/package.json" ]] && grep -q '"migrate"' backend/package.json; then
    log "Ejecutando migraciones de base de datos..."
    npm run migrate --prefix backend
    log "Migraciones aplicadas."
else
    warn "No se encontró script 'migrate' en backend/package.json. Omitiendo migraciones."
fi

# =============================================================================
# 5. Reload de procesos PM2 (zero-downtime)
# =============================================================================
log "Recargando procesos con PM2 (zero-downtime reload)..."

# Verificar si PM2 ya tiene los procesos corriendo
if pm2 list | grep -q "api"; then
    pm2 reload all --update-env
    log "PM2 reload completado."
else
    warn "PM2 no tiene procesos registrados. Iniciando desde config..."
    pm2 start "$SCRIPT_DIR/pm2.config.js" --env production
    pm2 save
    log "PM2 iniciado y guardado."
fi

# =============================================================================
# 6. Verificar salud de la API
# =============================================================================
log "Verificando salud de la API..."
HEALTH_RETRIES=5
HEALTH_URL="http://localhost:3000/health"

for i in $(seq 1 $HEALTH_RETRIES); do
    if curl -sf "$HEALTH_URL" > /dev/null 2>&1; then
        log "API respondiendo correctamente en $HEALTH_URL"
        break
    fi
    warn "Intento $i/$HEALTH_RETRIES — API no responde aún, esperando 3s..."
    sleep 3
    if [[ $i -eq $HEALTH_RETRIES ]]; then
        err "La API no respondió después de $HEALTH_RETRIES intentos. Revisa los logs: pm2 logs api"
    fi
done

# =============================================================================
# Resumen
# =============================================================================
echo ""
log "=== Deploy completado exitosamente ==="
echo ""
echo "  Branch:  $BRANCH"
echo "  Commit:  $(git rev-parse --short HEAD)"
echo "  Hora:    $TIMESTAMP"
echo ""
echo "  Estado PM2:"
pm2 status
echo ""
echo "  Para ver logs: pm2 logs"
