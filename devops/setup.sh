#!/usr/bin/env bash
# =============================================================================
# Electrica Ventas - Setup script para Ubuntu 22.04 LTS
# Ejecutar como root: sudo bash setup.sh
# =============================================================================
set -e

# --- Colores para output ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[+]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

[[ $EUID -ne 0 ]] && err "Este script debe ejecutarse como root (sudo bash setup.sh)"

# =============================================================================
# 1. Update y upgrade del sistema
# =============================================================================
log "Actualizando el sistema..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y \
    curl \
    wget \
    gnupg2 \
    ca-certificates \
    lsb-release \
    apt-transport-https \
    software-properties-common \
    unzip \
    git \
    build-essential \
    ufw \
    fail2ban \
    logrotate

# =============================================================================
# 2. Instalar Node.js 20 via nvm
# =============================================================================
log "Instalando NVM y Node.js 20..."

# Crear usuario electrica (si no existe) antes de instalar nvm
if ! id -u electrica &>/dev/null; then
    useradd --system --no-create-home --shell /usr/sbin/nologin electrica
    log "Usuario del sistema 'electrica' creado."
else
    warn "Usuario 'electrica' ya existe, omitiendo creación."
fi

# Instalar nvm para root (usado durante setup; PM2 usará el Node instalado)
export NVM_DIR="/root/.nvm"
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# Cargar nvm en la sesión actual
# shellcheck disable=SC1090
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

nvm install 20
nvm alias default 20
nvm use 20

# Crear symlinks en /usr/local/bin para que pm2/node sean accesibles sin nvm
NODE_PATH=$(nvm which 20)
NODE_BIN_DIR=$(dirname "$NODE_PATH")
ln -sf "$NODE_BIN_DIR/node"  /usr/local/bin/node
ln -sf "$NODE_BIN_DIR/npm"   /usr/local/bin/npm
ln -sf "$NODE_BIN_DIR/npx"   /usr/local/bin/npx

log "Node.js $(node --version) instalado."

# =============================================================================
# 3. Instalar PostgreSQL 16
# =============================================================================
log "Instalando PostgreSQL 16..."

# Agregar clave GPG y repositorio oficial de PostgreSQL
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    | gpg --dearmor -o /usr/share/keyrings/postgresql-archive-keyring.gpg

echo "deb [signed-by=/usr/share/keyrings/postgresql-archive-keyring.gpg] \
https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list

apt-get update -y
apt-get install -y postgresql-16 postgresql-client-16

systemctl enable postgresql
systemctl start postgresql

log "PostgreSQL $(psql --version) instalado."

# =============================================================================
# 4. Instalar Redis 7
# =============================================================================
log "Instalando Redis 7..."

curl -fsSL https://packages.redis.io/gpg \
    | gpg --dearmor -o /usr/share/keyrings/redis-archive-keyring.gpg

echo "deb [signed-by=/usr/share/keyrings/redis-archive-keyring.gpg] \
https://packages.redis.io/deb $(lsb_release -cs) main" \
    > /etc/apt/sources.list.d/redis.list

apt-get update -y
apt-get install -y redis

systemctl enable redis-server
systemctl start redis-server

log "Redis $(redis-server --version) instalado."

# =============================================================================
# 5. Instalar Nginx
# =============================================================================
log "Instalando Nginx..."
apt-get install -y nginx
systemctl enable nginx
systemctl start nginx
log "Nginx $(nginx -v 2>&1) instalado."

# =============================================================================
# 6. Instalar Certbot
# =============================================================================
log "Instalando Certbot..."
apt-get install -y certbot python3-certbot-nginx
log "Certbot $(certbot --version) instalado."

# =============================================================================
# 7. Instalar PM2 globalmente
# =============================================================================
log "Instalando PM2..."
npm install -g pm2
pm2 startup systemd -u root --hp /root
ln -sf "$(which pm2)" /usr/local/bin/pm2 2>/dev/null || true
log "PM2 $(pm2 --version) instalado."

# =============================================================================
# 8. Crear usuario del sistema 'electrica' (ya creado arriba si no existía)
# =============================================================================
log "Configurando usuario del sistema 'electrica'..."
# Ya se creó en el paso 2; aquí nos aseguramos de que no tenga shell de login
usermod --shell /usr/sbin/nologin electrica 2>/dev/null || true

# =============================================================================
# 9. Crear directorios de la aplicación
# =============================================================================
log "Creando directorios de la aplicación..."

APP_DIRS=(
    "/etc/electrica"
    "/var/log/electrica"
    "/backups/electrica"
    "/var/www/certbot"
)

for DIR in "${APP_DIRS[@]}"; do
    mkdir -p "$DIR"
done

# Permisos
chown -R electrica:electrica /etc/electrica
chmod 750 /etc/electrica

chown -R electrica:electrica /var/log/electrica
chmod 755 /var/log/electrica

chown -R electrica:electrica /backups/electrica
chmod 750 /backups/electrica

log "Directorios creados con permisos correctos."

# =============================================================================
# 10. Configurar UFW (firewall)
# =============================================================================
log "Configurando UFW..."

ufw --force reset

# Permitir SSH, HTTP y HTTPS
ufw allow 22/tcp   comment "SSH"
ufw allow 80/tcp   comment "HTTP"
ufw allow 443/tcp  comment "HTTPS"

# Denegar puertos internos desde el exterior
ufw deny 3000  comment "Fastify API (interno)"
ufw deny 3001  comment "WebSocket (interno)"
ufw deny 5432  comment "PostgreSQL (interno)"
ufw deny 6379  comment "Redis (interno)"

# Política por defecto
ufw default deny incoming
ufw default allow outgoing

# Habilitar UFW
ufw --force enable
log "UFW habilitado. Estado actual:"
ufw status verbose

# =============================================================================
# 11. Instalar y configurar Fail2Ban
# =============================================================================
log "Configurando Fail2Ban..."

systemctl enable fail2ban
systemctl start fail2ban

# Configuración básica de jail
cat > /etc/fail2ban/jail.local << 'FAIL2BAN_JAIL'
[DEFAULT]
bantime  = 3600
findtime = 600
maxretry = 5
backend  = systemd

[sshd]
enabled  = true
port     = ssh
logpath  = %(sshd_log)s
maxretry = 3

[nginx-http-auth]
enabled = true

[nginx-limit-req]
enabled = true
port    = http,https
logpath = /var/log/nginx/electrica-error.log

[electrica-webhook]
enabled  = true
port     = http,https
filter   = electrica-webhook
logpath  = /var/log/nginx/electrica-access.log
maxretry = 10
bantime  = 1800
FAIL2BAN_JAIL

# Copiar filtro de webhook si existe
FILTER_SRC="$(dirname "$(realpath "$0")")/fail2ban/electrica-webhook.conf"
if [[ -f "$FILTER_SRC" ]]; then
    cp "$FILTER_SRC" /etc/fail2ban/filter.d/electrica-webhook.conf
    log "Filtro Fail2Ban copiado."
else
    warn "Filtro fail2ban no encontrado en $FILTER_SRC. Cópialo manualmente a /etc/fail2ban/filter.d/"
fi

systemctl restart fail2ban
log "Fail2Ban configurado."

# =============================================================================
# Resumen final
# =============================================================================
echo ""
echo -e "${GREEN}=============================================${NC}"
echo -e "${GREEN}  Setup completado exitosamente${NC}"
echo -e "${GREEN}=============================================${NC}"
echo ""
echo "Siguientes pasos:"
echo "  1. Copiar .env desde devops/.env.template → /etc/electrica/.env"
echo "  2. Configurar PostgreSQL: sudo -u postgres psql < schema.sql"
echo "  3. Copiar nginx config: cp devops/nginx/electrica-ventas.conf /etc/nginx/sites-available/"
echo "  4. Habilitar nginx config: ln -s /etc/nginx/sites-available/electrica-ventas.conf /etc/nginx/sites-enabled/"
echo "  5. Obtener SSL: sudo bash devops/ssl-setup.sh"
echo "  6. Iniciar app: pm2 start devops/pm2.config.js --env production"
echo ""
