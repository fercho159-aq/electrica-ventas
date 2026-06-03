# Electrica Ventas - Guía de Setup de Infraestructura

## Requisitos previos

- VPS Ubuntu 22.04 LTS (mínimo 2 vCPU, 4 GB RAM, 40 GB disco)
- Dominio `api.electrica.mx` con registro DNS A apuntando a la IP del servidor
- Acceso root o usuario con sudo
- Cuenta activa en [360dialog](https://www.360dialog.com/)

---

## Orden de ejecución

### Paso 1 — Setup del servidor

Ejecutar una sola vez en el VPS recién creado:

```bash
sudo bash devops/setup.sh
```

Este script instala y configura:
- Node.js 20 (via nvm)
- PostgreSQL 16
- Redis 7
- Nginx
- Certbot
- PM2
- UFW (firewall)
- Fail2Ban

### Paso 2 — Configurar variables de entorno

```bash
# Copiar el template
sudo cp devops/.env.template /etc/electrica/.env

# Editar el archivo con los valores reales
sudo nano /etc/electrica/.env
```

Variables obligatorias que debes completar antes de continuar:

| Variable | Descripción |
|----------|-------------|
| `DATABASE_URL` | URL de conexión a PostgreSQL con usuario y contraseña reales |
| `REDIS_URL` | `redis://127.0.0.1:6379` (default, no cambiar en producción) |
| `JWT_SECRET` | Generar: `openssl rand -hex 64` |
| `JWT_REFRESH_SECRET` | Generar: `openssl rand -hex 64` (diferente al anterior) |
| `ENCRYPTION_KEY` | Generar: `openssl rand -hex 32` |
| `WA_WEBHOOK_SECRET` | Obtener de 360dialog al registrar el webhook |
| `SMTP_*` | Credenciales del servidor de correo saliente |
| `IMAP_*` | Credenciales del servidor de correo entrante |
| `BULL_BOARD_PASS` | Contraseña para el panel de colas |

### Paso 3 — Crear la base de datos PostgreSQL

```bash
# Crear usuario y base de datos
sudo -u postgres psql << 'SQL'
CREATE USER electrica_user WITH PASSWORD 'CAMBIAR_PASSWORD';
CREATE DATABASE electrica_ventas OWNER electrica_user;
GRANT ALL PRIVILEGES ON DATABASE electrica_ventas TO electrica_user;
SQL

# Ejecutar schema inicial (cuando exista)
# sudo -u postgres psql electrica_ventas < backend/db/schema.sql
```

### Paso 4 — Configurar Nginx

```bash
# Copiar la configuración
sudo cp devops/nginx/electrica-ventas.conf /etc/nginx/sites-available/

# Habilitar el sitio
sudo ln -sf /etc/nginx/sites-available/electrica-ventas.conf /etc/nginx/sites-enabled/

# Desactivar el sitio default
sudo rm -f /etc/nginx/sites-enabled/default

# Verificar configuración
sudo nginx -t

# Recargar Nginx
sudo systemctl reload nginx
```

### Paso 5 — Obtener certificado SSL

```bash
sudo bash devops/ssl-setup.sh tu@email.com
```

El script verifica la resolución DNS, obtiene el certificado con certbot y configura la renovación automática.

### Paso 6 — Instalar cron de backups

```bash
sudo cp devops/cron/backup-cron /etc/cron.d/electrica-backup
sudo chmod 644 /etc/cron.d/electrica-backup
```

### Paso 7 — Configurar Fail2Ban

```bash
# Copiar filtro personalizado
sudo cp devops/fail2ban/electrica-webhook.conf /etc/fail2ban/filter.d/

# Reiniciar Fail2Ban
sudo systemctl restart fail2ban

# Verificar que el jail está activo
sudo fail2ban-client status electrica-webhook
```

### Paso 8 — Build y arranque de la aplicación

```bash
# En el directorio del proyecto
npm ci --prefix backend
npm run build --prefix backend

# Iniciar todos los procesos con PM2
pm2 start devops/pm2.config.js --env production

# Guardar lista de procesos para que PM2 los reinicie al reboot
pm2 save

# Verificar
pm2 status
```

---

## Registrar webhooks en 360dialog

Cada canal de WhatsApp necesita tener su webhook registrado en 360dialog. El patrón de URL es:

```
https://api.electrica.mx/webhook/wa/{UUID_DEL_CANAL}
```

Donde `{UUID_DEL_CANAL}` es el campo `uuid` de la tabla `canales` en la base de datos.

### Pasos para registrar un webhook en 360dialog

1. Ingresar al [portal de 360dialog](https://hub.360dialog.com/)
2. Seleccionar el canal (número de WhatsApp)
3. Ir a **Settings → Webhooks**
4. Ingresar la URL: `https://api.electrica.mx/webhook/wa/{UUID_DEL_CANAL}`
5. Copiar el **Webhook Secret** que genera 360dialog
6. Agregar ese secreto en `/etc/electrica/.env`:
   ```
   WA_WEBHOOK_SECRET=el_secreto_copiado
   ```
7. Reiniciar el proceso API:
   ```bash
   pm2 restart api
   ```
8. Hacer clic en **Verify** en el portal de 360dialog

### Verificar que el webhook funciona

```bash
# Ver logs en tiempo real
pm2 logs api --lines 50

# O via nginx
sudo tail -f /var/log/nginx/electrica-access.log
```

---

## Deploys subsecuentes

Para actualizar la aplicación en producción:

```bash
bash devops/deploy.sh
```

El script hace git pull, reinstala dependencias, recompila y recarga PM2 sin downtime.

---

## Monitoreo y operaciones comunes

```bash
# Estado de todos los procesos
pm2 status

# Logs de un proceso específico
pm2 logs api
pm2 logs worker-mensajes

# Reiniciar un proceso
pm2 restart api

# Ver estado de Fail2Ban
sudo fail2ban-client status
sudo fail2ban-client status electrica-webhook

# Ver IPs baneadas
sudo fail2ban-client status electrica-webhook | grep "Banned IP"

# Desbanear una IP manualmente
sudo fail2ban-client set electrica-webhook unbanip 1.2.3.4

# Verificar certificado SSL
sudo certbot certificates

# Forzar renovación de certificado
sudo certbot renew --force-renewal --nginx
```

---

## Rutas y archivos importantes

| Ruta | Descripción |
|------|-------------|
| `/etc/electrica/.env` | Variables de entorno de producción |
| `/var/log/electrica/` | Logs de la aplicación y PM2 |
| `/backups/electrica/` | Dumps diarios de PostgreSQL |
| `/etc/nginx/sites-available/electrica-ventas.conf` | Configuración de Nginx |
| `/var/log/nginx/electrica-access.log` | Access log de Nginx |
| `/var/log/nginx/electrica-error.log` | Error log de Nginx |
| `/etc/fail2ban/filter.d/electrica-webhook.conf` | Filtro Fail2Ban personalizado |
| `/etc/cron.d/electrica-backup` | Crontab de backups |
