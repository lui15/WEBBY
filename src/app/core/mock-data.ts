/**
 * Datos de ejemplo para la Fase 1.
 * En la Fase 2 se sustituyen por lo que llega de Supabase
 * (Search Console, GA4 y la Central de Solicitudes).
 */
import {
  Agent,
  ChatMessage,
  FunnelData,
  Goal,
  HourlyVisits,
  Proposal,
  SearchQuery,
  Site,
  SiteId,
  WebAction,
  WeeklyReport,
} from './models';

export const SITES: Site[] = [
  {
    id: 'obralocal',
    nombre: 'ObraLocal',
    dominio: 'obralocalmadrid.es',
    servicio: 'Reformas',
    colorVar: '--obralocal',
    softVar: '--soft-orange',
  },
  {
    id: 'mudanzas',
    nombre: 'Mudanzas360',
    dominio: 'mudanzas360.es',
    servicio: 'Mudanzas',
    colorVar: '--mudanzas',
    softVar: '--soft-blue',
  },
  {
    id: 'armamuebles',
    nombre: 'ArmaMuebles',
    dominio: 'armamuebles.es',
    servicio: 'Montaje de muebles',
    colorVar: '--armamuebles',
    softVar: '--soft-green',
  },
];

export const AGENTS: Agent[] = [
  {
    id: 'seo',
    nombre: 'SEO',
    icon: 'search-outline',
    especialidad: 'Google y Maps',
    descripcion: 'Te ayuda a salir más arriba en Google y en Google Maps en Madrid.',
    color: '#047857',
    avisos: 2,
    sugerencias: [
      '¿Cómo salgo más en Madrid?',
      '¿Qué búsquedas me traen clientes?',
      '¿Por qué bajé esta semana?',
    ],
  },
  {
    id: 'marketing',
    nombre: 'Marketing',
    icon: 'brush-outline',
    especialidad: 'Contenido y confianza',
    descripcion: 'Ideas de publicaciones, textos y cosas que dan confianza.',
    color: '#C2410C',
    avisos: 0,
    sugerencias: ['Dame 3 ideas de publicaciones', '¿Cómo consigo más reseñas?'],
  },
  {
    id: 'anuncios',
    nombre: 'Anuncios',
    icon: 'megaphone-outline',
    especialidad: 'Google Ads',
    descripcion: 'Te propone campañas de Google Ads cuando bajan las solicitudes. Nunca las publica.',
    color: '#1C4ED8',
    avisos: 1,
    sugerencias: ['¿Me conviene anunciarme?', '¿Cuánto costaría una campaña?'],
  },
  {
    id: 'competencia',
    nombre: 'Competencia',
    icon: 'podium-outline',
    especialidad: 'Quién te supera',
    descripcion: 'Mira quién te supera en Google en Madrid y qué hace mejor.',
    color: '#B42318',
    avisos: 0,
    sugerencias: ['Compárame con Habitissimo', '¿Quién me gana en mudanzas?'],
  },
  {
    id: 'desarrollo',
    nombre: 'Desarrollo',
    icon: 'code-slash-outline',
    especialidad: 'Código y diseño',
    descripcion: 'Lee el código de tus webs y propone mejoras. Solo cambia algo si tú apruebas.',
    color: '#6D28D9',
    avisos: 1,
    sugerencias: ['¿Mi web carga rápido?', '¿Qué mejorarías del formulario?'],
  },
];

export const FUNNEL: Record<SiteId, FunnelData> = {
  obralocal: {
    vieron: 1240, vieronPrev: 1105,
    entraron: 45, entraronPrev: 39,
    contactaron: 8, contactaronPrev: 6,
  },
  mudanzas: {
    vieron: 2310, vieronPrev: 2480,
    entraron: 71, entraronPrev: 80,
    contactaron: 5, contactaronPrev: 7,
  },
  armamuebles: {
    vieron: 860, vieronPrev: 720,
    entraron: 38, entraronPrev: 30,
    contactaron: 6, contactaronPrev: 4,
  },
};

const curve = [0, 0, 0, 0, 0, 0, 1, 2, 4, 6, 7, 6, 5, 4, 5, 6, 7, 8, 9, 8, 6, 4, 2, 1];
export const HOURLY: Record<SiteId, HourlyVisits[]> = {
  obralocal: curve.map((p, hora) => ({ hora, personas: p })),
  mudanzas: curve.map((p, hora) => ({ hora, personas: Math.round(p * 1.5) })),
  armamuebles: curve.map((p, hora) => ({ hora, personas: Math.round(p * 0.8) })),
};

export const LIVE_NOW: Record<SiteId, number> = { obralocal: 2, mudanzas: 3, armamuebles: 1 };

export const QUERIES: Record<SiteId, SearchQuery[]> = {
  obralocal: [
    { consulta: 'reformas madrid', vieron: 420, entraron: 12, solicitudes: 3, puesto: 8 },
    { consulta: 'reforma cocina madrid', vieron: 260, entraron: 9, solicitudes: 2, puesto: 11 },
    { consulta: 'reforma baño precio', vieron: 190, entraron: 7, solicitudes: 2, puesto: 14 },
    { consulta: 'empresa reformas carabanchel', vieron: 85, entraron: 6, solicitudes: 1, puesto: 4 },
  ],
  mudanzas: [
    { consulta: 'mudanzas madrid', vieron: 980, entraron: 22, solicitudes: 2, puesto: 12 },
    { consulta: 'mudanza madrid valencia', vieron: 340, entraron: 15, solicitudes: 2, puesto: 6 },
    { consulta: 'precio mudanza piso', vieron: 300, entraron: 9, solicitudes: 1, puesto: 15 },
    { consulta: 'guardamuebles madrid', vieron: 210, entraron: 4, solicitudes: 0, puesto: 19 },
  ],
  armamuebles: [
    { consulta: 'montaje muebles ikea madrid', vieron: 310, entraron: 14, solicitudes: 3, puesto: 5 },
    { consulta: 'montador de cocinas madrid', vieron: 180, entraron: 9, solicitudes: 2, puesto: 9 },
    { consulta: 'montar armario pax', vieron: 150, entraron: 8, solicitudes: 1, puesto: 7 },
    { consulta: 'montador muebles a domicilio', vieron: 120, entraron: 3, solicitudes: 0, puesto: 16 },
  ],
};

export const GOALS: Goal[] = [
  { siteId: 'obralocal', objetivo: 30, actual: 18 },
  { siteId: 'mudanzas', objetivo: 25, actual: 11 },
  { siteId: 'armamuebles', objetivo: 20, actual: 14 },
];

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

export const PROPOSALS: Proposal[] = [
  {
    id: 'p1',
    agentId: 'desarrollo',
    ideaDe: 'seo',
    siteId: 'obralocal',
    titulo: 'Crear tu página de reformas de cocina',
    que: 'Una página nueva solo para «reforma de cocina en Madrid», con precios orientativos, fotos de trabajos y el formulario de presupuesto.',
    porque: '260 personas buscaron «reforma cocina madrid» esta semana y sales en el puesto 11. Ahora esas búsquedas caen en tu página general, que no habla de cocinas.',
    archivos: [
      { ruta: 'src/app/pages/reforma-cocina/reforma-cocina.ts', tipo: 'nuevo' },
      { ruta: 'src/app/pages/reforma-cocina/reforma-cocina.html', tipo: 'nuevo' },
      { ruta: 'src/app/app.routes.ts', tipo: 'modificado' },
      { ruta: 'public/sitemap.xml', tipo: 'modificado' },
    ],
    rama: 'webby/pagina-reforma-cocina',
    estado: 'pendiente',
    createdAt: minutesAgo(12),
  },
  {
    id: 'p2',
    agentId: 'anuncios',
    siteId: 'mudanzas',
    titulo: 'Campaña de anuncios para mudanzas',
    que: 'Una campaña pequeña en Google Ads para «mudanzas Madrid» en Chamberí, Salamanca y Retiro, con unos 10 € al día.',
    porque: 'Las solicitudes de Mudanzas360 bajaron de 7 a 5 esta semana. Es solo un informe: no se publica ni se paga nada.',
    archivos: [],
    estado: 'pendiente',
    createdAt: minutesAgo(95),
  },
  {
    id: 'p3',
    agentId: 'seo',
    siteId: 'armamuebles',
    titulo: 'Mejorar el título de la página de cocinas',
    que: 'Cambiar el título que sale en Google para que diga «Montador de cocinas en Madrid · Presupuesto en 24 h».',
    porque: '180 personas vieron esta página en Google, pero solo 9 entraron. Un título más claro suele atraer más clics.',
    archivos: [{ ruta: 'src/app/pages/cocinas/cocinas.ts', tipo: 'modificado' }],
    rama: 'webby/titulo-cocinas',
    estado: 'pendiente',
    createdAt: minutesAgo(60 * 26),
  },
  {
    id: 'p4',
    agentId: 'desarrollo',
    siteId: 'mudanzas',
    titulo: 'Botón de WhatsApp fijo en móvil',
    que: 'Un botón de WhatsApp siempre visible abajo a la derecha en el móvil.',
    porque: 'El 78 % de tus visitas llegan desde el móvil.',
    archivos: [{ ruta: 'src/app/shared/whatsapp-fab.ts', tipo: 'nuevo' }],
    rama: 'webby/whatsapp-fijo',
    estado: 'pr_abierto',
    createdAt: minutesAgo(60 * 24 * 4),
  },
  {
    id: 'p5',
    agentId: 'marketing',
    siteId: 'obralocal',
    titulo: 'Publicar precios cerrados de baños',
    que: 'Una tabla con precios cerrados por tamaño de baño.',
    porque: 'La gente busca «reforma baño precio».',
    archivos: [],
    estado: 'rechazada',
    createdAt: minutesAgo(60 * 24 * 6),
  },
];

export const SEO_CHAT: ChatMessage[] = [
  {
    id: 'm1',
    rol: 'agente',
    texto: 'Hola, Luis. Esta semana ObraLocal salió en Google 1.240 veces, un 12 % más. Lo que más te trae clientes es «reformas madrid».',
  },
  {
    id: 'm2',
    rol: 'yo',
    texto: '¿Por qué búsqueda llegaron los que rellenaron el formulario?',
  },
  {
    id: 'm3',
    rol: 'agente',
    texto: 'Cruzando Google con tus solicitudes, estas 8 personas llegaron así:',
    lista: [
      { etiqueta: 'reformas madrid', valor: 3, detalle: 'puesto 8' },
      { etiqueta: 'reforma cocina madrid', valor: 2, detalle: 'puesto 11' },
      { etiqueta: 'reforma baño precio', valor: 2, detalle: 'puesto 14' },
      { etiqueta: 'empresa reformas carabanchel', valor: 1, detalle: 'puesto 4' },
    ],
  },
  {
    id: 'm4',
    rol: 'agente',
    texto: 'Las cocinas te traen clientes aunque sales en el puesto 11. Con una página propia podrías subir a la primera página.',
    accion: { texto: 'Pasárselo a Desarrollo para que la cree', agentId: 'desarrollo' },
  },
];

export const REPORTS: WeeklyReport[] = [
  {
    id: 'r46',
    semanaInicio: '2026-11-09',
    semanaFin: '2026-11-15',
    resumen: 'Buena semana para reformas y montaje; mudanzas se frenó un poco.',
    filas: [
      { siteId: 'obralocal', entraron: 45, solicitudes: 8, solicitudesPrev: 6 },
      { siteId: 'mudanzas', entraron: 71, solicitudes: 5, solicitudesPrev: 7 },
      { siteId: 'armamuebles', entraron: 38, solicitudes: 6, solicitudesPrev: 4 },
    ],
    equipo: [
      { agentId: 'seo', texto: 'Las cocinas de ObraLocal tienen hueco para subir en Google.' },
      { agentId: 'marketing', texto: 'Tres reseñas nuevas en ArmaMuebles: buen momento para pedir más.' },
      { agentId: 'anuncios', texto: 'Mudanzas bajó; te dejo una campaña pequeña por si quieres probar.' },
      { agentId: 'competencia', texto: 'Mudanza 24 aparece por encima en «mudanzas madrid».' },
      { agentId: 'desarrollo', texto: 'El formulario de Mudanzas360 tarda 3 s en cargar en móvil.' },
    ],
    recomendaciones: [
      'Aprobar la página de reformas de cocina.',
      'Pedir reseña a los 3 últimos clientes de ArmaMuebles.',
      'Revisar la campaña que propone el agente de Anuncios.',
    ],
  },
  {
    id: 'r45', semanaInicio: '2026-11-02', semanaFin: '2026-11-08',
    resumen: 'Semana estable en las tres webs.',
    filas: [
      { siteId: 'obralocal', entraron: 39, solicitudes: 6, solicitudesPrev: 5 },
      { siteId: 'mudanzas', entraron: 80, solicitudes: 7, solicitudesPrev: 7 },
      { siteId: 'armamuebles', entraron: 30, solicitudes: 4, solicitudesPrev: 5 },
    ],
    equipo: [], recomendaciones: [],
  },
  {
    id: 'r44', semanaInicio: '2026-10-26', semanaFin: '2026-11-01',
    resumen: 'Mudanzas tuvo su mejor semana del mes.',
    filas: [
      { siteId: 'obralocal', entraron: 35, solicitudes: 5, solicitudesPrev: 6 },
      { siteId: 'mudanzas', entraron: 84, solicitudes: 7, solicitudesPrev: 5 },
      { siteId: 'armamuebles', entraron: 33, solicitudes: 5, solicitudesPrev: 4 },
    ],
    equipo: [], recomendaciones: [],
  },
];

export const ACTIONS: WebAction[] = [
  {
    id: 'a1', fecha: '2026-11-14T18:20:00', siteId: 'armamuebles', tipo: 'resena',
    titulo: 'Respondiste 3 reseñas en Google Maps',
    detalle: 'Las tres de 5 estrellas de esta semana.',
  },
  {
    id: 'a2', fecha: '2026-11-13T11:05:00', siteId: 'mudanzas', tipo: 'cambio_web',
    titulo: 'Botón de WhatsApp fijo en el móvil',
    detalle: 'Propuesta de Desarrollo · Pull Request #12 fusionado.',
    efecto: 'Desde entonces: 9 clics en WhatsApp (antes 4 a la semana).', efectoDir: 'up',
  },
  {
    id: 'a3', fecha: '2026-11-12T20:40:00', siteId: 'obralocal', tipo: 'cambio_manual',
    titulo: 'Cambiaste las fotos de la página de baños',
    detalle: 'Commit en la rama principal: «nuevas fotos baños carabanchel».',
    efecto: 'Desde entonces: la gente pasa 40 s más en esa página.', efectoDir: 'up',
  },
  {
    id: 'a4', fecha: '2026-11-11T09:15:00', siteId: 'obralocal', tipo: 'objetivo',
    titulo: 'Subiste el objetivo de ObraLocal a 30 solicitudes al mes',
  },
  {
    id: 'a5', fecha: '2026-11-10T17:30:00', siteId: 'mudanzas', tipo: 'aprobada',
    titulo: 'Aprobaste «Botón de WhatsApp fijo en móvil»',
    detalle: 'Desarrollo abrió el Pull Request #12 para que lo revisaras.',
  },
  {
    id: 'a6', fecha: '2026-11-09T12:00:00', siteId: 'obralocal', tipo: 'rechazada',
    titulo: 'Rechazaste «Publicar precios cerrados de baños»',
  },
  {
    id: 'a7', fecha: '2026-11-06T10:10:00', siteId: 'armamuebles', tipo: 'cambio_manual',
    titulo: 'Arreglaste el texto del formulario de cocinas',
    detalle: 'Commit en la rama principal: «fix texto paso 2».',
  },
  {
    id: 'a8', fecha: '2026-11-04T16:45:00', siteId: 'mudanzas', tipo: 'ficha',
    titulo: 'Actualizaste el horario de tu ficha de Google Maps',
  },
  {
    id: 'a9', fecha: '2026-10-29T13:20:00', siteId: 'obralocal', tipo: 'cambio_web',
    titulo: 'Nueva página de reformas en Carabanchel',
    detalle: 'Pull Request #8 fusionado.',
    efecto: 'Desde entonces: sales en el puesto 4 para «empresa reformas carabanchel».', efectoDir: 'up',
  },
];
