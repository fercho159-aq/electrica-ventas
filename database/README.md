# Electrica Ventas CRM — Base de Datos

Documentación de la capa de datos: esquema, migraciones, backups y variables de configuración.

---

## Requisitos

- PostgreSQL 16+
- Variables de entorno configuradas (ver sección Variables)
- Usuario de SO con acceso a `psql` y `pg_dump` en el `PATH`

---

## Variables de entorno

| Variable         | Descripción                                   | Valor por defecto          |
|------------------|-----------------------------------------------|----------------------------|
| `DB_HOST`        | Host del servidor PostgreSQL                  | `localhost`                |
| `DB_PORT`        | Puerto TCP                                    | `5432`                     |
| `DB_NAME`        | Nombre de la base de datos                    | `electrica_ventas`         |
| `DB_USER`        | Usuario de la aplicación (permisos DML)       | `electrica_app`            |
| `DB_PASSWORD`    | Contraseña del usuario de la aplicación       | _(obligatorio)_            |
| `DB_SUPERUSER`   | Superusuario para crear DB y roles            | `postgres`                 |
| `SUPER_PASSWORD` | Contraseña del superusuario                   | _(según pg_hba.conf)_      |
| `APP_USER`       | Alias de `DB_USER` usado en los scripts       | `electrica_app`            |
| `APP_PASSWORD`   | Alias de `DB_PASSWORD` usado en los scripts   | _(obligatorio)_            |
| `BACKUP_DIR`     | Directorio donde se guardan los backups       | `/var/backups/electrica-ventas` |
| `MIGRATIONS_DIR` | Ruta a la carpeta de migraciones              | `../migrations` (relativo al script) |
| `RETENTION_DAYS` | Días de retención de backups                  | `30`                       |

Se recomienda definir estas variables en un archivo `.env` y cargarlo antes de ejecutar los scripts:

```bash
export $(grep -v '^#' .env | xargs)
```

---

## Estructura de directorios

```
database/
├── migrations/
│   ├── 001_initial.sql   — Creación de tablas
│   ├── 002_indices.sql   — Índices de rendimiento
│   └── 003_seed.sql      — Datos iniciales (usuarios, canales, productos)
├── scripts/
│   ├── create_db.sh      — Crea la DB, usuario de app y ejecuta migraciones
│   ├── backup.sh         — Genera un dump comprimido con retención automática
│   └── restore.sh        — Restaura desde el backup más reciente o por fecha
└── README.md             — Este archivo
```

---

## Crear la base de datos por primera vez

```bash
# Dar permisos de ejecución (solo la primera vez)
chmod +x database/scripts/*.sh

# Exportar variables mínimas
export DB_HOST=localhost
export DB_PORT=5432
export DB_SUPERUSER=postgres
export SUPER_PASSWORD=tu_password_postgres
export APP_USER=electrica_app
export APP_PASSWORD=tu_password_app

# Ejecutar el script de setup completo
./database/scripts/create_db.sh
```

El script realiza en orden:

1. Crea el rol `electrica_app` (o actualiza su contraseña si ya existe).
2. Crea la base de datos `electrica_ventas` con codificación UTF-8.
3. Otorga privilegios al usuario de app sobre el schema `public`.
4. Ejecuta todas las migraciones `*.sql` en orden alfanumérico.

---

## Ejecutar migraciones manualmente

Si ya tienes la DB creada y solo quieres aplicar una migración específica:

```bash
psql \
  --host=$DB_HOST \
  --port=$DB_PORT \
  --username=$DB_USER \
  --dbname=$DB_NAME \
  --file=database/migrations/001_initial.sql
```

Para aplicar todas desde cero en una DB existente:

```bash
for f in database/migrations/*.sql; do
  echo "Aplicando $f..."
  psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f "$f"
done
```

---

## Backup

```bash
# Con variables de entorno ya exportadas
./database/scripts/backup.sh
```

- Genera un archivo `electrica_ventas_YYYYMMDD_HHMMSS.sql.gz` en `$BACKUP_DIR`.
- Usa compresión gzip nivel 9.
- Elimina automáticamente backups con más de `$RETENTION_DAYS` días (default 30).

Ejemplo de nombre de archivo generado:

```
electrica_ventas_20241201_023015.sql.gz
```

Para hacer backup desde un cron job diario a las 2 AM:

```cron
0 2 * * * DB_PASSWORD=secreto APP_USER=electrica_app /ruta/database/scripts/backup.sh >> /var/log/electrica-backup.log 2>&1
```

---

## Restore

```bash
# Restaurar el backup más reciente
./database/scripts/restore.sh

# Restaurar el backup más reciente del día 2024-12-01
./database/scripts/restore.sh 20241201

# Restaurar un backup específico por timestamp
./database/scripts/restore.sh 20241201_0230
```

El script pide confirmación interactiva antes de sobreescribir la base de datos.

---

## Esquema de tablas

| Tabla               | Descripción                                              |
|---------------------|----------------------------------------------------------|
| `usuarios`          | Vendedores y gerentes del CRM                            |
| `canales`           | Canales de comunicación (WhatsApp, email)                |
| `leads`             | Prospectos y su etapa en el pipeline de ventas           |
| `mensajes`          | Conversaciones entrantes y salientes por lead            |
| `productos`         | Catálogo de materiales y equipos eléctricos              |
| `cotizaciones`      | Cotizaciones generadas para cada lead                    |
| `cotizacion_items`  | Líneas de producto dentro de cada cotización             |
| `plantillas_wa`     | Plantillas de mensaje aprobadas por Meta                 |
| `campanas`          | Campañas de mensajería masiva                            |
| `asignacion_reglas` | Regla de asignación automática de leads por canal        |

---

## Usuarios iniciales (seed)

| Email                        | Rol      | Contraseña inicial |
|------------------------------|----------|--------------------|
| gerencia@electrica.mx        | gerente  | `Admin2024!`       |
| ana.morales@electrica.mx     | vendedor | `Vendedor2024!`    |
| bruno.esquivel@electrica.mx  | vendedor | `Vendedor2024!`    |
| carla.vazquez@electrica.mx   | vendedor | `Vendedor2024!`    |
| diego.paredes@electrica.mx   | vendedor | `Vendedor2024!`    |
| elena.castano@electrica.mx   | vendedor | `Vendedor2024!`    |
| fernando.ortiz@electrica.mx  | vendedor | `Vendedor2024!`    |
| gabriela.ruiz@electrica.mx   | vendedor | `Vendedor2024!`    |
| hector.luna@electrica.mx     | vendedor | `Vendedor2024!`    |
| irene.salgado@electrica.mx   | vendedor | `Vendedor2024!`    |
| javier.medrano@electrica.mx  | vendedor | `Vendedor2024!`    |
| karla.benitez@electrica.mx   | vendedor | `Vendedor2024!`    |

**Cambiar todas las contraseñas antes de poner en producción.**

Las contraseñas se almacenan como hashes bcrypt (cost 10) generados con `pgcrypto`.  
Para verificar un login desde la aplicación:

```sql
SELECT id, nombre, rol
FROM usuarios
WHERE email = 'gerencia@electrica.mx'
  AND password_hash = crypt('Admin2024!', password_hash);
```

---

## Notas de seguridad

- El archivo `api_key_encrypted` en `canales` contiene el valor `PENDIENTE_360DIALOG`. Debe reemplazarse con las API keys reales cifradas antes de conectar con 360dialog.
- No commitear archivos `.env` con contraseñas reales al repositorio.
- El usuario `electrica_app` solo tiene permisos DML (`SELECT`, `INSERT`, `UPDATE`, `DELETE`). Las operaciones DDL requieren el superusuario.
