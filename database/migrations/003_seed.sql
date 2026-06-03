-- =============================================================================
-- Electrica Ventas CRM — Migración 003: Datos iniciales (seed)
-- PostgreSQL 16
-- Las contraseñas están hasheadas con bcrypt (cost 10) vía pgcrypto.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. USUARIOS
-- ---------------------------------------------------------------------------

-- Gerente principal (UUID fijo para referencias futuras)
INSERT INTO usuarios (id, nombre, email, password_hash, rol, zona, activo)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Gerencia Electrica',
    'gerencia@electrica.mx',
    crypt('Admin2024!', gen_salt('bf', 10)),
    'gerente',
    NULL,
    true
)
ON CONFLICT (email) DO NOTHING;

-- Vendedores
INSERT INTO usuarios (nombre, email, password_hash, rol, zona, activo)
VALUES
    ('Ana Morales',      'ana.morales@electrica.mx',      crypt('Vendedor2024!', gen_salt('bf', 10)), 'vendedor', 'Centro',     true),
    ('Bruno Esquivel',   'bruno.esquivel@electrica.mx',   crypt('Vendedor2024!', gen_salt('bf', 10)), 'vendedor', 'Norte',      true),
    ('Carla Vázquez',    'carla.vazquez@electrica.mx',    crypt('Vendedor2024!', gen_salt('bf', 10)), 'vendedor', 'Sur',        true),
    ('Diego Paredes',    'diego.paredes@electrica.mx',    crypt('Vendedor2024!', gen_salt('bf', 10)), 'vendedor', 'Industrial', true),
    ('Elena Castaño',    'elena.castano@electrica.mx',    crypt('Vendedor2024!', gen_salt('bf', 10)), 'vendedor', 'Poniente',   true),
    ('Fernando Ortiz',   'fernando.ortiz@electrica.mx',   crypt('Vendedor2024!', gen_salt('bf', 10)), 'vendedor', 'Oriente',    true),
    ('Gabriela Ruiz',    'gabriela.ruiz@electrica.mx',    crypt('Vendedor2024!', gen_salt('bf', 10)), 'vendedor', 'Centro',     true),
    ('Héctor Luna',      'hector.luna@electrica.mx',      crypt('Vendedor2024!', gen_salt('bf', 10)), 'vendedor', 'Norte',      true),
    ('Irene Salgado',    'irene.salgado@electrica.mx',    crypt('Vendedor2024!', gen_salt('bf', 10)), 'vendedor', 'Sur',        true),
    ('Javier Medrano',   'javier.medrano@electrica.mx',   crypt('Vendedor2024!', gen_salt('bf', 10)), 'vendedor', 'Industrial', true),
    ('Karla Benítez',    'karla.benitez@electrica.mx',    crypt('Vendedor2024!', gen_salt('bf', 10)), 'vendedor', 'Poniente',   true)
ON CONFLICT (email) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. CANALES
-- ---------------------------------------------------------------------------

-- 14 canales WhatsApp
INSERT INTO canales (tipo, nombre, numero, api_key_encrypted, activo)
VALUES
    ('whatsapp', 'WA-Construcción-01',  '+528100000001', 'PENDIENTE_360DIALOG', true),
    ('whatsapp', 'WA-Construcción-02',  '+528100000002', 'PENDIENTE_360DIALOG', true),
    ('whatsapp', 'WA-Residencial-03',   '+528100000003', 'PENDIENTE_360DIALOG', true),
    ('whatsapp', 'WA-Residencial-04',   '+528100000004', 'PENDIENTE_360DIALOG', true),
    ('whatsapp', 'WA-Comercial-05',     '+528100000005', 'PENDIENTE_360DIALOG', true),
    ('whatsapp', 'WA-Comercial-06',     '+528100000006', 'PENDIENTE_360DIALOG', true),
    ('whatsapp', 'WA-Proyectos-07',     '+528100000007', 'PENDIENTE_360DIALOG', true),
    ('whatsapp', 'WA-Proyectos-08',     '+528100000008', 'PENDIENTE_360DIALOG', true),
    ('whatsapp', 'WA-Mantenimiento-09', '+528100000009', 'PENDIENTE_360DIALOG', true),
    ('whatsapp', 'WA-Mantenimiento-10', '+528100000010', 'PENDIENTE_360DIALOG', true),
    ('whatsapp', 'WA-Gobierno-11',      '+528100000011', 'PENDIENTE_360DIALOG', true),
    ('whatsapp', 'WA-Gobierno-12',      '+528100000012', 'PENDIENTE_360DIALOG', true),
    ('whatsapp', 'WA-Industrial-13',    '+528100000013', 'PENDIENTE_360DIALOG', true),
    ('whatsapp', 'WA-Industrial-14',    '+528100000014', 'PENDIENTE_360DIALOG', true);

-- 2 canales email
INSERT INTO canales (tipo, nombre, numero, activo)
VALUES
    ('email', 'Email Ventas Generales', 'ventas@electrica.mx',   true),
    ('email', 'Email Proyectos',        'proyectos@electrica.mx', true);

-- ---------------------------------------------------------------------------
-- 3. PRODUCTOS
-- ---------------------------------------------------------------------------
INSERT INTO productos (nombre, descripcion, precio, unidad, activo)
VALUES
    ('Cable THW-LS Cal.12 (rollo 100m)',
     'Cable de cobre 600V THW-LS calibre 12 AWG, rollo de 100 metros. Ideal para instalaciones eléctricas residenciales y comerciales.',
     180.00, 'rollo', true),

    ('Interruptor termomagnético 1P 20A',
     'Interruptor automático monopolar 20 amperios 120/240V para protección de circuitos eléctricos.',
     320.00, 'pieza', true),

    ('Centro de carga 8 circuitos',
     'Tablero de distribución para 8 circuitos, incluye barra neutral y tierra, para carga de 100A.',
     890.00, 'pieza', true),

    ('Contactor 3P 40A 220V',
     'Contactor electromagnético trifásico 40 amperios 220V, categoría AC-3, con bobina de 220V.',
     1200.00, 'pieza', true),

    ('Tubo conduit PVC 3/4" (tramo 3m)',
     'Tubo conduit de PVC rígido diámetro 3/4 pulgada, longitud 3 metros. Para protección de cableado.',
     85.00, 'tramo', true),

    ('Lámpara LED panel 60x60 40W',
     'Panel LED empotrable 60x60 cm, 40 watts, luz blanca 4000K, flujo luminoso 3600 lm, para plafón.',
     450.00, 'pieza', true),

    ('Canaleta ranurada 40x40mm',
     'Canaleta plástica ranurada 40x40mm para organización de cables en instalaciones eléctricas y de datos.',
     95.00, 'metro', true),

    ('Cable UTP Cat 6 (caja 305m)',
     'Cable de datos UTP categoría 6, caja de 305 metros, para redes LAN de alta velocidad hasta 1 Gbps.',
     2100.00, 'caja', true),

    ('Transformador 15 kVA trifásico',
     'Transformador de distribución trifásico 15 kVA, relación 13.2kV / 220V, núcleo de acero silicio, enfriamiento ONAN.',
     18500.00, 'pieza', true),

    ('Luminaria industrial LED 150W',
     'Luminaria tipo campana LED 150 watts, IP65, para naves industriales y bodegas. Sustituto de 400W halogenuros.',
     1800.00, 'pieza', true),

    ('Pastilla termomagnética 2P 30A',
     'Interruptor automático bipolar 30 amperios 240V para protección de circuitos bifásicos.',
     480.00, 'pieza', true),

    ('Cinta aislante 3M Super 33+ (pack 10)',
     'Cinta de vinilo aislante autofusionante 3M Super 33+, 19mm x 9.1m, empaque con 10 rollos.',
     240.00, 'pack', true),

    ('Bomba centrífuga 1.5HP 220V',
     'Bomba centrífuga monofásica 1.5 HP, 220V, para agua potable, caudal máximo 80 L/min, impulsor de acero inox.',
     4200.00, 'pieza', true),

    ('Variador de frecuencia 5HP',
     'Variador de velocidad (VFD) para motor trifásico 5 HP / 3.7 kW, 220V, con pantalla LCD y comunicación RS-485.',
     8900.00, 'pieza', true),

    ('Tablero de control NEMA 12',
     'Gabinete metálico NEMA 12 para tablero de control, 60x60x25 cm, IP54, con platina interior y barra de tierra.',
     3200.00, 'pieza', true);

-- ---------------------------------------------------------------------------
-- 4. REGLAS DE ASIGNACIÓN (round_robin para los 14 canales WA)
-- ---------------------------------------------------------------------------
INSERT INTO asignacion_reglas (canal_id, modo)
SELECT id, 'round_robin'
FROM   canales
WHERE  tipo = 'whatsapp'
ON CONFLICT (canal_id) DO NOTHING;
