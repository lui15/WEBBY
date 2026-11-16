export type SiteId = 'obralocal' | 'mudanzas' | 'armamuebles';
export type SiteFilter = SiteId | 'todas';
export type AgentId = 'seo' | 'marketing' | 'anuncios' | 'competencia' | 'desarrollo';

export interface Site {
  id: SiteId;
  nombre: string;
  dominio: string;
  servicio: string;
  /** Nombre de la variable CSS de su color, p. ej. "--obralocal" */
  colorVar: string;
  softVar: string;
}

export interface Agent {
  id: AgentId;
  nombre: string;
  especialidad: string;
  /** Icono de Ionicons que representa lo que hace */
  icon: string;
  descripcion: string;
  color: string;
  avisos: number;
  sugerencias: string[];
}

/** Datos de la semana (o del periodo) de una web, ya en el embudo. */
export interface FunnelData {
  vieron: number;
  vieronPrev: number;
  entraron: number;
  entraronPrev: number;
  contactaron: number;
  contactaronPrev: number;
}

export interface HourlyVisits {
  hora: number;
  personas: number;
}

export interface SearchQuery {
  consulta: string;
  vieron: number;
  entraron: number;
  solicitudes: number;
  puesto: number;
}

export interface Goal {
  siteId: SiteId;
  objetivo: number;
  actual: number;
}

export type ProposalState =
  | 'pendiente'
  | 'aprobada'
  | 'rechazada'
  | 'en_progreso'
  | 'pr_abierto'
  | 'fusionada';

export interface ProposalFile {
  ruta: string;
  tipo: 'nuevo' | 'modificado';
}

export interface Proposal {
  id: string;
  agentId: AgentId;
  ideaDe?: AgentId;
  siteId: SiteId;
  titulo: string;
  que: string;
  porque: string;
  archivos: ProposalFile[];
  rama?: string;
  /** Enlace al Pull Request en GitHub, cuando existe */
  prUrl?: string;
  estado: ProposalState;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  rol: 'yo' | 'agente';
  texto: string;
  lista?: { etiqueta: string; valor: number; detalle: string }[];
  accion?: { texto: string; agentId: AgentId };
  /** Propuestas que el agente guardó en esta respuesta */
  propuestas?: { id: string; titulo: string }[];
}

export interface ReportSiteRow {
  siteId: SiteId;
  entraron: number;
  solicitudes: number;
  solicitudesPrev: number;
}

export interface WeeklyReport {
  id: string;
  semanaInicio: string;
  semanaFin: string;
  resumen: string;
  filas: ReportSiteRow[];
  equipo: { agentId: AgentId; texto: string }[];
  recomendaciones: string[];
}

export type Period = 'hoy' | '7d' | '30d' | 'comparar';

/**
 * Algo que pasó en una de tus webs o que hiciste desde Webby.
 * Fuentes (Fases 2-7): commits y Pull Requests de GitHub (también los que hagas tú a mano),
 * decisiones sobre propuestas, cambios de objetivos y acciones en Google Business Profile.
 */
export type ActionKind =
  | 'cambio_web'      // cambio publicado en la web (commit o PR fusionado en la rama principal)
  | 'cambio_manual'   // cambio que hiciste tú directamente en el código, fuera de Webby
  | 'aprobada'        // aprobaste una propuesta
  | 'rechazada'       // rechazaste una propuesta
  | 'objetivo'        // cambiaste un objetivo
  | 'resena'          // respondiste una reseña de Google
  | 'ficha';          // cambiaste tu ficha de Google Maps

export interface WebAction {
  id: string;
  fecha: string;
  siteId: SiteId;
  tipo: ActionKind;
  titulo: string;
  detalle?: string;
  /** Lo que ha pasado desde entonces, en lenguaje sencillo. */
  efecto?: string;
  efectoDir?: 'up' | 'down';
  /** Enlace al commit o al Pull Request en GitHub. */
  enlace?: string;
}
