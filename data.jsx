// Datos mock realistas para Electrica Ventas
// Sector: materiales eléctricos / ferretería industrial

const VENDEDORES = [
  { id: 'v1',  nombre: 'Ana Morales',       iniciales: 'AM', estado: 'online',  zona: 'Centro',     cargaActual: 12, activo: true },
  { id: 'v2',  nombre: 'Bruno Esquivel',    iniciales: 'BE', estado: 'online',  zona: 'Norte',      cargaActual: 9,  activo: true },
  { id: 'v3',  nombre: 'Carla Vázquez',     iniciales: 'CV', estado: 'ocupado', zona: 'Sur',        cargaActual: 15, activo: true },
  { id: 'v4',  nombre: 'Diego Paredes',     iniciales: 'DP', estado: 'online',  zona: 'Industrial', cargaActual: 7,  activo: true },
  { id: 'v5',  nombre: 'Elena Castaño',     iniciales: 'EC', estado: 'online',  zona: 'Centro',     cargaActual: 11, activo: true },
  { id: 'v6',  nombre: 'Fernando Ortiz',    iniciales: 'FO', estado: 'offline', zona: 'Poniente',   cargaActual: 6,  activo: false },
  { id: 'v7',  nombre: 'Gabriela Ruiz',     iniciales: 'GR', estado: 'online',  zona: 'Oriente',    cargaActual: 14, activo: true },
  { id: 'v8',  nombre: 'Héctor Luna',       iniciales: 'HL', estado: 'online',  zona: 'Industrial', cargaActual: 10, activo: true },
  { id: 'v9',  nombre: 'Irene Salgado',     iniciales: 'IS', estado: 'ocupado', zona: 'Norte',      cargaActual: 13, activo: true },
  { id: 'v10', nombre: 'Javier Medrano',    iniciales: 'JM', estado: 'online',  zona: 'Sur',        cargaActual: 8,  activo: true },
  { id: 'v11', nombre: 'Karla Benítez',     iniciales: 'KB', estado: 'online',  zona: 'Centro',     cargaActual: 10, activo: true },
];

// KPIs por vendedor (mes actual)
const KPIS = {
  v1:  { msgs: 312, respMin: 4.2,  cotiz: 28, cerradas: 11, ingresos: 184200, tasa: 0.39 },
  v2:  { msgs: 241, respMin: 6.8,  cotiz: 22, cerradas: 7,  ingresos: 112400, tasa: 0.32 },
  v3:  { msgs: 498, respMin: 3.1,  cotiz: 41, cerradas: 19, ingresos: 312800, tasa: 0.46 },
  v4:  { msgs: 178, respMin: 8.4,  cotiz: 15, cerradas: 4,  ingresos: 61200,  tasa: 0.27 },
  v5:  { msgs: 289, respMin: 5.5,  cotiz: 24, cerradas: 9,  ingresos: 143900, tasa: 0.38 },
  v6:  { msgs: 92,  respMin: 14.2, cotiz: 8,  cerradas: 2,  ingresos: 28400,  tasa: 0.25 },
  v7:  { msgs: 402, respMin: 3.8,  cotiz: 36, cerradas: 16, ingresos: 268100, tasa: 0.44 },
  v8:  { msgs: 265, respMin: 5.1,  cotiz: 21, cerradas: 8,  ingresos: 124500, tasa: 0.38 },
  v9:  { msgs: 356, respMin: 4.9,  cotiz: 30, cerradas: 12, ingresos: 198700, tasa: 0.40 },
  v10: { msgs: 201, respMin: 7.2,  cotiz: 17, cerradas: 5,  ingresos: 74800,  tasa: 0.29 },
  v11: { msgs: 278, respMin: 5.4,  cotiz: 23, cerradas: 9,  ingresos: 138600, tasa: 0.39 },
};

// Productos típicos del sector eléctrico
const PRODUCTOS = [
  'Cable THW-LS Cal.12 (rollo 100m)',
  'Interruptor termomagnético 1P 20A',
  'Centro de carga 8 circuitos',
  'Contactor 3P 40A 220V',
  'Tubo conduit PVC 3/4" (tramo 3m)',
  'Lámpara LED panel 60x60 40W',
  'Canaleta ranurada 40x40mm',
  'Cable UTP Cat 6 (caja 305m)',
  'Transformador 15 kVA trifásico',
  'Luminaria industrial LED 150W',
  'Pastilla termomagnética 2P 30A',
  'Cinta aislante 3M Super 33+ (pack 10)',
  'Bomba centrífuga 1.5HP 220V',
  'Variador de frecuencia 5HP',
  'Tablero de control NEMA 12',
];

const EMPRESAS = [
  'Constructora Aldama y Asociados',
  'Industrias Metálicas del Bajío',
  'Grupo Inmobiliario Treviño',
  'Refaccionaria El Voltio',
  'Maquiladora Textil Norteña',
  'Hotelera Costa Azul',
  'Desarrollos Pinar SA de CV',
  'Servicios Eléctricos Reyna',
  'Planta Avícola San Marcos',
  'Transportes Refrigerados Delta',
  'Cervecería Artesanal La Presa',
  'Clínica Dental Integral',
  'Centro Comercial Plaza Solar',
  'Electromontajes Industriales MX',
  'Panificadora La Espiga Dorada',
  'Taller Automotriz Rodríguez',
  'Granja Acuícola Aguas Claras',
  'Colegio Bilingüe Nueva Era',
  'Imprenta Tipográfica del Valle',
  'Condominio Residencial Los Álamos',
];

const NOMBRES_CONTACTO = [
  'Roberto Zamudio', 'María Fernanda Lozano', 'Sergio Cáceres', 'Lucía Peñaloza',
  'Raúl Mendieta', 'Valeria Santillán', 'Óscar Nájera', 'Patricia Guevara',
  'Miguel Arellano', 'Daniela Covarrubias', 'Tomás Quintanilla', 'Sofía Arreola',
  'Ignacio Barrientos', 'Rocío Camacho', 'Leonel Garza', 'Adriana Fierro',
  'Cristián Almanza', 'Mónica Saldaña', 'Eduardo Bustos', 'Renata Villafañe',
];

const ETAPAS = [
  { id: 'nuevo',      label: 'Nuevo',         color: '#78716c' },
  { id: 'contactado', label: 'Contactado',    color: '#0369a1' },
  { id: 'cotizado',   label: 'Cotizado',      color: '#a16207' },
  { id: 'negociacion',label: 'Negociación',   color: '#c2410c' },
  { id: 'cerrado',    label: 'Cerrado',       color: '#15803d' },
  { id: 'no_cierre',  label: 'No cierre',     color: '#9f1239' },
];

const CANALES = ['whatsapp-1', 'whatsapp-2', 'email'];

// Generador determinístico
function seedRand(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const rand = seedRand(42);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const pickInt = (a, b) => a + Math.floor(rand() * (b - a + 1));

function generarLeads() {
  const leads = [];
  const now = Date.now();
  for (let i = 0; i < 84; i++) {
    const etapaPick = rand();
    let etapa;
    if (etapaPick < 0.18) etapa = 'nuevo';
    else if (etapaPick < 0.38) etapa = 'contactado';
    else if (etapaPick < 0.58) etapa = 'cotizado';
    else if (etapaPick < 0.72) etapa = 'negociacion';
    else if (etapaPick < 0.88) etapa = 'cerrado';
    else etapa = 'no_cierre';

    const asignado = etapa === 'nuevo' && rand() < 0.6 ? null : VENDEDORES[Math.floor(rand() * VENDEDORES.length)].id;
    const canal = pick(CANALES);
    const horasAtras = pickInt(0, 480);
    const createdAt = now - horasAtras * 3600 * 1000;
    const monto = pickInt(8, 320) * 1000 + pickInt(0, 999);
    const productos = [];
    const n = pickInt(1, 4);
    const pool = [...PRODUCTOS];
    for (let j = 0; j < n; j++) {
      const idx = Math.floor(rand() * pool.length);
      productos.push({ nombre: pool.splice(idx, 1)[0], cantidad: pickInt(1, 40), precio: pickInt(180, 4800) });
    }
    const tiempoRespMin = etapa === 'nuevo' ? null : pickInt(1, 45);
    leads.push({
      id: 'L' + String(3482 + i),
      contacto: pick(NOMBRES_CONTACTO),
      empresa: pick(EMPRESAS),
      telefono: '+52 81 ' + pickInt(1000, 9999) + ' ' + pickInt(1000, 9999),
      email: 'compras' + pickInt(1, 99) + '@' + pick(['gmail.com', 'hotmail.com', 'outlook.com', 'empresa.mx']),
      canal,
      etapa,
      asignadoA: asignado,
      createdAt,
      ultimaInteraccion: createdAt + pickInt(0, horasAtras) * 3600 * 1000,
      tiempoRespMin,
      monto,
      productos,
      zona: pick(['Centro', 'Norte', 'Sur', 'Industrial', 'Poniente', 'Oriente']),
      prioridad: rand() < 0.2 ? 'alta' : rand() < 0.5 ? 'media' : 'baja',
      cotizacionEnviada: ['cotizado', 'negociacion', 'cerrado', 'no_cierre'].includes(etapa),
      motivoNoCierre: etapa === 'no_cierre' ? pick(['Precio', 'Tiempo de entrega', 'Competencia', 'Sin presupuesto', 'Especificaciones']) : null,
      notas: '',
    });
  }
  return leads;
}

const LEADS = generarLeads();

// Conversación ejemplo para el detalle
const CONVERSACION_EJEMPLO = [
  { from: 'cliente', canal: 'whatsapp', ts: '09:42', texto: 'Buen día, necesito cotización de 20 rollos de cable THW cal. 12 y 3 centros de carga de 8 circuitos. Es para una obra en San Pedro.' },
  { from: 'vendedor', canal: 'whatsapp', ts: '09:51', texto: 'Buen día Sr. Zamudio, con gusto. ¿El cable lo prefiere negro o por colores? ¿Y los centros de carga marca Square D o Schneider?' },
  { from: 'cliente', canal: 'whatsapp', ts: '10:08', texto: 'Colores estándar (negro, blanco, verde). Los centros preferentemente Square D. ¿Tienen existencia?' },
  { from: 'vendedor', canal: 'whatsapp', ts: '10:11', texto: 'Sí, tenemos todo en almacén. Le paso cotización formal por correo en unos minutos.' },
  { from: 'sistema', ts: '10:34', texto: 'Cotización COT-2041 enviada por correo' },
  { from: 'cliente', canal: 'email', ts: '11:20', texto: 'Recibida. ¿Manejan precio especial si pagamos contra entrega? También me interesa saber tiempos de entrega a obra.' },
  { from: 'vendedor', canal: 'email', ts: '11:45', texto: 'Con pago contado 5% dto. adicional. Entrega mismo día si confirma antes de las 14:00 hrs.' },
  { from: 'cliente', canal: 'whatsapp', ts: '12:02', texto: 'Perfecto, procedemos. Les mando orden de compra en la tarde.' },
];

// Cotizaciones
const COTIZACIONES = LEADS
  .filter(l => l.cotizacionEnviada)
  .slice(0, 24)
  .map((l, i) => ({
    id: 'COT-' + String(2040 + i),
    leadId: l.id,
    cliente: l.empresa,
    contacto: l.contacto,
    monto: l.productos.reduce((s, p) => s + p.cantidad * p.precio, 0),
    estado: l.etapa === 'cerrado' ? 'aceptada' : l.etapa === 'no_cierre' ? 'rechazada' : (i % 3 === 0 ? 'vista' : i % 3 === 1 ? 'enviada' : 'pendiente'),
    fecha: new Date(l.createdAt + 2 * 3600 * 1000),
    vendedor: l.asignadoA,
    vigencia: pickInt(7, 30),
    productos: l.productos,
  }));

// Unidades GPS (roadmap)
const UNIDADES = [
  { id: 'U01', placa: 'SKJ-4821', vendedor: 'v3', ubicacion: 'Av. Constitución', estatus: 'En ruta',   x: 34, y: 62 },
  { id: 'U02', placa: 'TPR-9104', vendedor: 'v7', ubicacion: 'Bodega central',   estatus: 'Detenido',  x: 52, y: 44 },
  { id: 'U03', placa: 'MLN-3352', vendedor: 'v4', ubicacion: 'Parque Industrial',estatus: 'En ruta',   x: 71, y: 31 },
  { id: 'U04', placa: 'XAB-6678', vendedor: 'v1', ubicacion: 'Centro',           estatus: 'Entrega',   x: 46, y: 58 },
  { id: 'U05', placa: 'KTR-0145', vendedor: 'v9', ubicacion: 'Norte',            estatus: 'En ruta',   x: 62, y: 22 },
  { id: 'U06', placa: 'WDN-7730', vendedor: 'v8', ubicacion: 'Sur',              estatus: 'Detenido',  x: 28, y: 78 },
];

// Histórico diario (últimos 14 días) para sparklines
function generarSerie(base, variacion) {
  const out = [];
  for (let i = 0; i < 14; i++) {
    out.push(Math.max(0, Math.round(base + (rand() - 0.5) * variacion)));
  }
  return out;
}

const SERIES = {
  leadsEntrantes: generarSerie(32, 20),
  leadsCerrados:  generarSerie(11, 8),
  respuestaMin:   generarSerie(5, 3),
  cotizDiarias:   generarSerie(16, 10),
};

Object.assign(window, {
  VENDEDORES, KPIS, PRODUCTOS, EMPRESAS, ETAPAS, CANALES,
  LEADS, CONVERSACION_EJEMPLO, COTIZACIONES, UNIDADES, SERIES,
});
