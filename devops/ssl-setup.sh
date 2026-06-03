#!/usr/bin/env bash
# =============================================================================
# Electrica Ventas - Obtener certificado SSL con Let's Encrypt
# Ejecutar DESPUÉS de que Nginx esté configurado y el dominio apunte al servidor
# Uso: sudo bash ssl-setup.sh [email]
# =============================================================================
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[+]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

[[ $EUID -ne 0 ]] && err "Ejecutar como root: sudo bash ssl-setup.sh"

DOMAIN="api.electrica.mx"
EMAIL="${1:-solucionesmaw@gmail.com}"

# --- Verificar que el dominio resuelve a este servidor ---
log "Verificando resolución DNS de $DOMAIN..."
SERVER_IP=$(curl -s https://api.ipify.org 2>/dev/null || curl -s http://ifconfig.me 2>/dev/null)
DOMAIN_IP=$(dig +short "$DOMAIN" 2>/dev/null | tail -n1)

if [[ "$SERVER_IP" != "$DOMAIN_IP" ]]; then
    warn "El dominio $DOMAIN resuelve a $DOMAIN_IP pero la IP del servidor es $SERVER_IP."
    warn "Asegúrate de que el DNS A record apunte a este servidor antes de continuar."
    read -r -p "¿Continuar de todas formas? [y/N] " CONFIRM
    [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]] && err "Operación cancelada."
else
    log "DNS correcto: $DOMAIN -> $SERVER_IP"
fi

# --- Verificar que Nginx está corriendo ---
if ! systemctl is-active --quiet nginx; then
    err "Nginx no está corriendo. Ejecuta: systemctl start nginx"
fi

# --- Verificar que la config de Nginx esté habilitada ---
NGINX_CONF_AVAILABLE="/etc/nginx/sites-available/electrica-ventas.conf"
NGINX_CONF_ENABLED="/etc/nginx/sites-enabled/electrica-ventas.conf"

if [[ ! -f "$NGINX_CONF_AVAILABLE" ]]; then
    warn "Configuración de Nginx no encontrada en $NGINX_CONF_AVAILABLE"
    warn "Copiando desde devops/nginx/electrica-ventas.conf..."
    cp "$(dirname "$(realpath "$0")")/nginx/electrica-ventas.conf" "$NGINX_CONF_AVAILABLE"
fi

if [[ ! -L "$NGINX_CONF_ENABLED" ]]; then
    ln -sf "$NGINX_CONF_AVAILABLE" "$NGINX_CONF_ENABLED"
    log "Nginx config habilitada."
fi

# Eliminar default config si existe para evitar conflictos
[[ -f /etc/nginx/sites-enabled/default ]] && rm -f /etc/nginx/sites-enabled/default

nginx -t || err "Configuración de Nginx inválida. Revisa el archivo de configuración."
systemctl reload nginx

# --- Obtener certificado ---
log "Obteniendo certificado SSL para $DOMAIN con email $EMAIL..."
certbot --nginx \
    -d "$DOMAIN" \
    --email "$EMAIL" \
    --agree-tos \
    --no-eff-email \
    --redirect \
    --hsts \
    --staple-ocsp

log "Certificado obtenido exitosamente."

# --- Configurar auto-renovación en cron ---
log "Configurando auto-renovación de certificado..."

CRON_JOB="0 3 * * * /usr/bin/certbot renew --quiet --nginx --post-hook 'systemctl reload nginx' >> /var/log/electrica/certbot-renew.log 2>&1"
CRON_FILE="/etc/cron.d/certbot-renew-electrica"

cat > "$CRON_FILE" << EOF
# Auto-renovación certificado Let's Encrypt para $DOMAIN
# Verifica cada día a las 3am; renueva si vence en menos de 30 días
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin

$CRON_JOB
EOF

chmod 644 "$CRON_FILE"
log "Cron de renovación creado en $CRON_FILE"

# --- Probar renovación en modo dry-run ---
log "Probando renovación (dry-run)..."
certbot renew --dry-run && log "Dry-run exitoso. La renovación automática está funcionando." \
    || warn "Dry-run falló. Revisa la configuración de certbot."

# --- Verificar certificado ---
log "Verificando certificado instalado:"
certbot certificates

echo ""
echo -e "${GREEN}=============================================${NC}"
echo -e "${GREEN}  SSL configurado exitosamente${NC}"
echo -e "${GREEN}=============================================${NC}"
echo ""
echo "  Dominio:       $DOMAIN"
echo "  Certificado:   /etc/letsencrypt/live/$DOMAIN/fullchain.pem"
echo "  Renovación:    Automática via $CRON_FILE"
echo ""
