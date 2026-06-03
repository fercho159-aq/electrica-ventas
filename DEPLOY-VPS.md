# Deploy Electrica Ventas — VPS 31.220.109.7

Guía para subir Electrica Ventas al VPS existente (multi-app), integrándose con la
infraestructura actual: nginx `sites-available`, PM2, Certbot/DuckDNS.

> **Convenciones de este VPS**
> - IP: `31.220.109.7`
> - Apps PM2 existentes: `api`, `mensajeria`, `n8n`, etc. → Electrica usa prefijo **`electrica-*`**
> - Puerto backend Electrica: **`3010`** (el `3000` lo usa appsoluciones)
> - Dominio nuevo: **`electrica-ventas.duckdns.org`**
> - Email Certbot: `fernandotrejo159@gmail.com`
> - Token DuckDNS: `<TU_TOKEN_DUCKDNS>`

---

## 0. Pre-requisitos en el VPS

Verifica qué ya está instalado (n8n suele traer PostgreSQL):

```bash
node --version          # necesita >= 20
psql --version          # PostgreSQL (cualquiera >= 14 sirve)
redis-cli ping          # debe responder PONG
pm2 list                # ver apps actuales y puertos ocupados
ss -ltnp | grep -E ':3000|:3010|:5432|:6379'   # confirmar que 3010 está libre
```

Instala lo que falte:

```bash
# Node 20 (si no está) vía nvm o nodesource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# PostgreSQL (si no está)
sudo apt install -y postgresql

# Redis (si no está)
sudo apt install -y redis-server
sudo systemctl enable --now redis-server
```

---

## 1. DNS — apuntar el subdominio

```bash
curl "https://www.duckdns.org/update?domains=electrica-ventas&token=<TU_TOKEN_DUCKDNS>&ip=31.220.109.7&verbose=true"
```

Debe responder `OK`. Verifica:

```bash
dig +short electrica-ventas.duckdns.org   # → 31.220.109.7
```

---

## 2. Clonar el código

```bash
sudo mkdir -p /var/www/electrica-ventas
sudo chown $USER:$USER /var/www/electrica-ventas
cd /var/www/electrica-ventas

# Opción A: git clone (si tienes el repo en GitHub)
git clone <tu-repo> .

# Opción B: subir por scp desde tu Mac
#   scp -r ~/Developer/electrica-ventas/* usuario@31.220.109.7:/var/www/electrica-ventas/
```

---

## 3. Base de datos

```bash
# Crear DB y usuario dedicado (NO uses el superusuario)
sudo -u postgres psql <<'SQL'
CREATE DATABASE electrica_ventas;
CREATE USER electrica_app WITH PASSWORD 'CAMBIA_ESTE_PASSWORD_FUERTE';
GRANT ALL PRIVILEGES ON DATABASE electrica_ventas TO electrica_app;
\c electrica_ventas
GRANT ALL ON SCHEMA public TO electrica_app;
SQL

# Correr migraciones en orden
cd /var/www/electrica-ventas
for f in database/migrations/0*.sql; do
  echo "→ $f"
  sudo -u postgres psql electrica_ventas -f "$f"
done
```

> Las migraciones `001`–`004` crean tablas, índices, seed (gerente + 11 vendedores +
> 14 canales WhatsApp + 2 email + 15 productos) y la columna `estado` de mensajes.

---

## 4. Variables de entorno

```bash
sudo mkdir -p /etc/electrica
sudo cp /var/www/electrica-ventas/devops/.env.template /etc/electrica/.env
sudo nano /etc/electrica/.env
sudo chmod 600 /etc/electrica/.env
```

Valores **mínimos** a configurar:

```bash
NODE_ENV=production
PORT=3010

DATABASE_URL=postgresql://electrica_app:CAMBIA_ESTE_PASSWORD_FUERTE@localhost:5432/electrica_ventas
REDIS_URL=redis://localhost:6379

# Genera secretos: openssl rand -hex 32
JWT_SECRET=<64 chars>
JWT_REFRESH_SECRET=<64 chars>
JWT_EXPIRES_IN=8h
JWT_REFRESH_EXPIRES_IN=30d

CORS_ORIGIN=https://electrica-ventas.duckdns.org
API_BASE_URL=https://electrica-ventas.duckdns.org

ENCRYPTION_KEY=<32 chars>

# Bull Board (admin colas)
BULL_BOARD_USER=admin
BULL_BOARD_PASS=<password fuerte>

# WhatsApp — se llenan por canal en la DB, no aquí (ver paso 8)
```

El backend carga `/etc/electrica/.env` vía `dotenv` (variable `DOTENV_CONFIG_PATH` o symlink).
Crea el symlink para que la app lo encuentre:

```bash
ln -sf /etc/electrica/.env /var/www/electrica-ventas/backend/.env
```

---

## 5. Build del backend

```bash
cd /var/www/electrica-ventas/backend
npm ci
npm run build        # genera dist/
```

Crea el directorio de logs PM2:

```bash
sudo mkdir -p /var/log/electrica
sudo chown $USER:$USER /var/log/electrica
```

---

## 6. Arrancar con PM2

```bash
cd /var/www/electrica-ventas
pm2 start devops/pm2.config.js --env production

pm2 list             # deben aparecer electrica-api, electrica-worker-mensajes, electrica-worker-campanas
pm2 logs electrica-api --lines 30

# Persistir entre reinicios del VPS (si no lo hiciste antes para otras apps)
pm2 save
pm2 startup          # ejecuta el comando que imprime
```

Prueba local antes de exponer:

```bash
curl http://127.0.0.1:3010/health
# → {"status":"ok","db":"connected",...}
```

---

## 7. nginx + SSL

```bash
# Copiar el site
sudo cp /var/www/electrica-ventas/devops/nginx/electrica.conf /etc/nginx/sites-available/electrica
sudo ln -s /etc/nginx/sites-available/electrica /etc/nginx/sites-enabled/

# IMPORTANTE: antes del primer certbot, comenta las 2 líneas ssl_certificate
# del archivo (aún no existen los certs) o usa el método DNS de abajo.

# Emitir certificado. DuckDNS suele necesitar el método DNS-01:
sudo certbot certonly \
  --authenticator dns-duckdns \
  --dns-duckdns-credentials /etc/letsencrypt/secrets/duckdns.ini \
  --dns-duckdns-propagation-seconds 180 \
  -d electrica-ventas.duckdns.org \
  --non-interactive --agree-tos -m fernandotrejo159@gmail.com

# Validar y recargar
sudo nginx -t
sudo systemctl reload nginx
```

Verifica desde fuera:

```bash
curl https://electrica-ventas.duckdns.org/health
```

Abre en navegador: **https://electrica-ventas.duckdns.org** → login con
`gerencia@electrica.mx` / `Admin2024!` (cámbialo en producción).

---

## 8. Conectar WhatsApp (Meta Cloud API)

El webhook ahora vive en una URL estable (ya no necesitas cloudflared):

```
https://electrica-ventas.duckdns.org/webhook/wa/{CANAL_ID}
```

### a) Actualizar el webhook en Meta

Meta for Developers → tu App → WhatsApp → Configuration → Webhooks → Edit:

| Campo | Valor |
|---|---|
| Callback URL | `https://electrica-ventas.duckdns.org/webhook/wa/{CANAL_ID}` |
| Verify token | el `webhook_secret` del canal en DB |

Suscribir el campo **`messages`**.

### b) Guardar credenciales de cada línea en la DB

Por cada uno de los 14 canales WhatsApp, guarda su Access Token y Phone Number ID:

```bash
sudo -u postgres psql electrica_ventas <<'SQL'
UPDATE canales SET
  api_key_encrypted = 'EAAxxx...TOKEN_DE_META',   -- access token de esa línea
  numero            = '1134059933127488',          -- phone_number_id de Meta
  webhook_secret    = 'APP_SECRET_DE_META'         -- App Secret (Config → Básica)
WHERE nombre = 'WA-Construcción-01';
SQL
```

> **Recordatorio MX:** el backend ya normaliza los números `521…` → `52…` al enviar
> (peculiaridad mexicana). No necesitas tocar nada para eso.
>
> **Tokens temporales** de Meta caducan en ~24h. Para producción genera un
> **System User token permanente** en Meta Business Settings y guárdalo en `api_key_encrypted`.

---

## 9. Backups automáticos

```bash
# Editar crontab
crontab -e
```

Agregar:

```cron
# Backup diario de Electrica a las 3am
0 3 * * * pg_dump electrica_ventas | gzip > /backups/electrica/$(date +\%F).sql.gz
# Limpieza de backups > 30 días, domingos 4am
0 4 * * 0 find /backups/electrica -name '*.sql.gz' -mtime +30 -delete
```

```bash
sudo mkdir -p /backups/electrica
```

---

## 10. Operación diaria

```bash
# Estado
pm2 list
pm2 logs electrica-api
pm2 logs electrica-worker-mensajes

# Reiniciar tras cambios
pm2 restart electrica-api electrica-worker-mensajes electrica-worker-campanas

# Ver colas de mensajes (admin)
# https://electrica-ventas.duckdns.org/admin/queues  (user/pass de BULL_BOARD_*)
```

### Redeploy tras cambios de código

```bash
cd /var/www/electrica-ventas
git pull                       # o scp de los archivos cambiados
cd backend && npm ci && npm run build
pm2 reload electrica-api electrica-worker-mensajes electrica-worker-campanas
```

El frontend (estático) se actualiza solo al hacer `git pull` — nginx sirve los archivos directo.

---

## Checklist final

- [ ] `dig electrica-ventas.duckdns.org` → 31.220.109.7
- [ ] `curl http://127.0.0.1:3010/health` → ok
- [ ] `curl https://electrica-ventas.duckdns.org/health` → ok (SSL válido)
- [ ] `pm2 list` muestra `electrica-api` + 2 workers `online`
- [ ] Login en el navegador funciona
- [ ] Webhook verificado en Meta (candado verde)
- [ ] Mensaje de prueba entra (aparece lead) y sale (✓✓ en la UI)
- [ ] `pm2 save` ejecutado
- [ ] Backup cron configurado

---

## Tabla de puertos (referencia VPS)

| App | Puerto interno | Dominio |
|-----|----------------|---------|
| appsoluciones (API ppal) | 3000 (aprox.) | appsoluciones.duckdns.org |
| **Electrica Ventas** | **3010** | **electrica-ventas.duckdns.org** |
| PostgreSQL | 5432 | — |
| Redis | 6379 | — |
| n8n | 5678 (aprox.) | n8n.mawsoluciones.com |

> Antes de arrancar, confirma con `ss -ltnp` que `3010` esté libre. Si está ocupado,
> cambia `PORT` en `/etc/electrica/.env`, el `proxy_pass` en `nginx/electrica.conf`
> y el `env_production.PORT` en `pm2.config.js`.
