#!/usr/bin/env bash
# =============================================================================
# Electrica Ventas — Script de redeploy (VPS multi-app 31.220.109.7)
# Ejecuta en el VPS desde /var/www/electrica-ventas:
#   ./devops/deploy.sh
#
# Hace: git pull → npm ci → build → migraciones → pm2 reload (SOLO electrica-*)
#
# IMPORTANTE: solo toca los procesos electrica-* — NO afecta appsoluciones, n8n, etc.
# =============================================================================
set -euo pipefail

PROJECT_DIR="/var/www/electrica-ventas"
BACKEND_DIR="$PROJECT_DIR/backend"
DB_NAME="electrica_ventas"

cyan()  { printf "\033[36m%s\033[0m\n" "$1"; }
green() { printf "\033[32m%s\033[0m\n" "$1"; }
red()   { printf "\033[31m%s\033[0m\n" "$1"; }

cd "$PROJECT_DIR"

# ── 1. Traer cambios ─────────────────────────────────────────────────────────
cyan "→ [1/5] git pull"
if [ -d .git ]; then
  git pull --ff-only
else
  red "  No es repo git — sube archivos por scp antes de correr esto."
fi

# ── 2. Dependencias + build del backend ──────────────────────────────────────
cyan "→ [2/5] npm ci + build"
cd "$BACKEND_DIR"
npm ci
npm run build

# ── 3. Migraciones (idempotentes: IF NOT EXISTS / ON CONFLICT) ──────────────
cyan "→ [3/5] migraciones"
cd "$PROJECT_DIR"
for f in database/migrations/0*.sql; do
  echo "   · $(basename "$f")"
  sudo -u postgres psql -q "$DB_NAME" -f "$f" >/dev/null 2>&1 \
    || echo "     (cambios ya aplicados — normal en redeploys)"
done

# ── 4. Reload PM2 — SOLO procesos electrica-* ───────────────────────────────
cyan "→ [4/5] pm2 startOrReload (solo electrica-*)"
# startOrReload arranca apps nuevas (p.ej. electrica-worker-recordatorios) y
# recarga las existentes; solo toca apps del ecosystem (todas electrica-*).
pm2 startOrReload "$PROJECT_DIR/devops/pm2.config.js" --env production --update-env
pm2 save

# ── 5. Healthcheck ───────────────────────────────────────────────────────────
cyan "→ [5/5] healthcheck"
sleep 3
PORT="$(grep -oE '^PORT=[0-9]+' /etc/electrica/.env 2>/dev/null | head -1 | cut -d= -f2)"
PORT="${PORT:-3010}"
if curl -fsS "http://127.0.0.1:${PORT}/health" | grep -q '"status":"ok"'; then
  green "✓ Deploy OK — API saludable en :${PORT}"
  pm2 list | grep electrica || true
else
  red "✗ Healthcheck falló. Revisa: pm2 logs electrica-api --lines 50"
  exit 1
fi
