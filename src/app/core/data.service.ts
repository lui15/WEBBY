import { Injectable, computed, effect, inject, signal } from '@angular/core';
import {
  AGENTS, FUNNEL, GOALS, HOURLY, LIVE_NOW, QUERIES, SITES,
} from './mock-data';
import {
  Agent, AgentId, ChatMessage, FunnelData, Goal, HourlyVisits, Proposal, ProposalState, SearchQuery,
  Site, SiteFilter, SiteId, WebAction, WeeklyReport,
} from './models';
import { SupabaseService } from './supabase.service';

/** Ficha de Google Business Profile (Maps) de una web. */
export interface GbpData {
  nombre: string;
  vistas: number;
  busqueda: number;
  maps: number;
  llamadas: number;
  web: number;
  como_llegar: number;
}

/** Aviso de un agente (campana y notificaciones al móvil). */
export interface Aviso {
  id: string;
  agentId: AgentId | null;
  siteId: SiteId | null;
  titulo: string;
  texto: string;
  enlace: string | null;
  leido: boolean;
  createdAt: string;
}

export type PushState = 'no_soportado' | 'bloqueado' | 'apagado' | 'activado';

export interface GoogleStatus {
  estado: 'cargando' | 'sin_conectar' | 'conectado';
  conectadoEl?: string;
  ultimaSync?: string;
  error?: string;
}

interface TodayData {
  ahora: number;
  hoy: number;
  horas: HourlyVisits[];
}

interface FunnelRow {
  site_id: SiteId;
  datos_hasta: string;
  vieron: number; vieron_prev: number;
  entraron: number; entraron_prev: number;
  contactaron: number; contactaron_prev: number;
}

interface DbMessage {
  id: string;
  rol: 'yo' | 'agente';
  contenido: string;
  created_at?: string;
  adjuntos_json: {
    propuestas?: { id: string; titulo: string }[];
    traspasos?: { agente: AgentId; titulo: string }[];
    traspaso?: { de: AgentId; titulo: string; propuesta_id?: string };
  } | null;
}

const toChat = (m: DbMessage): ChatMessage => {
  const t = m.adjuntos_json?.traspaso;
  return {
    id: m.id,
    rol: t ? 'nota' : m.rol,
    texto: m.contenido,
    createdAt: m.created_at,
    propuestas: m.adjuntos_json?.propuestas,
    traspasos: m.adjuntos_json?.traspasos,
    traspaso: t ? { de: t.de, titulo: t.titulo, propuestaId: t.propuesta_id } : undefined,
  };
};

/** Último mensaje de cada chat (lista de conversaciones). */
export interface ChatPreview {
  texto: string;
  rol: string;
  createdAt: string;
}

/** Los avisos de traspasos y revisiones ya están como mensaje en el chat; no se duplican. */
const esTraspaso = (titulo: string) => /te ha pasado:|^Revisión de /i.test(titulo);

/** Clave pública VAPID (base64url) a bytes, como pide PushManager.subscribe. */
function urlB64(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Un día de una web en metrics_daily (null = ese dato aún no ha llegado). */
export interface DailyPoint {
  siteId: SiteId;
  fecha: string;
  impresiones: number | null;
  clics: number | null;
  usuarios: number | null;
  conversiones: number | null;
}

/** Serie de ejemplo con forma creíble, para cuando Google no está conectado. */
function demoDaily(days: number): DailyPoint[] {
  const base: Record<SiteId, [number, number, number]> = {
    obralocal: [177, 6.4, 1.1], mudanzas: [330, 10, 0.7], armamuebles: [123, 5.4, 0.9],
  };
  const out: DailyPoint[] = [];
  for (let i = days; i >= 2; i--) {
    const fecha = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    const t = (days - i) / days;
    for (const [id, [imp, cli, conv]] of Object.entries(base) as [SiteId, [number, number, number]][]) {
      const wave = 1 + 0.18 * Math.sin(i / 2.3 + id.length) + (id === 'armamuebles' ? 0.5 * t : id === 'mudanzas' ? -0.15 * t : 0.25 * t);
      out.push({
        siteId: id, fecha,
        impresiones: Math.round(imp * wave), clics: Math.round(cli * wave),
        usuarios: Math.round(cli * wave * 1.6), conversiones: Math.round(conv * wave * (i % 3 === 0 ? 1.4 : 0.7)),
      });
    }
  }
  return out;
}

const EMPTY: FunnelData = { vieron: 0, vieronPrev: 0, entraron: 0, entraronPrev: 0, contactaron: 0, contactaronPrev: 0 };
/** Para simular otros periodos en modo ejemplo. */
const DEMO_FACTOR = (days: number) => days / 7;

/**
 * Punto único de acceso a los datos.
 * - Métricas, búsquedas, objetivos e historial: Supabase (esquema webby).
 * - Mientras Google no esté conectado, las métricas son de ejemplo (demo()).
 * - Agentes, propuestas e informes: de ejemplo hasta las fases 4-6.
 */
@Injectable({ providedIn: 'root' })
export class DataService {
  private readonly sb = inject(SupabaseService);

  readonly sites = SITES;
  /** Agentes con el número de avisos sin leer de cada uno. */
  get agents(): Agent[] {
    const unread = this._avisos().filter((a) => !a.leido);
    return AGENTS.map((a) => ({ ...a, avisos: unread.filter((u) => u.agentId === a.id).length }));
  }
  readonly reports = signal<WeeklyReport[]>([]);
  private readonly _avisos = signal<Aviso[]>([]);
  readonly avisos = this._avisos.asReadonly();
  readonly unreadAvisos = computed(() => this._avisos().filter((a) => !a.leido).length);
  readonly push = signal<PushState>('apagado');
  /** true mientras se actualiza todo (botón Actualizar). */
  readonly refreshing = signal(false);

  readonly loading = signal(true);
  readonly google = signal<GoogleStatus>({ estado: 'cargando' });
  /** true = se están enseñando métricas de ejemplo */
  readonly demo = computed(() => this.google().estado !== 'conectado');
  readonly syncing = signal(false);
  readonly datosHasta = signal<string | null>(null);

  private readonly funnels = signal<Record<number, Record<SiteId, FunnelData>>>({});
  private readonly queryCache = signal<Record<string, SearchQuery[]>>({});
  private readonly todayCache = signal<Partial<Record<SiteId, TodayData>>>({});
  readonly todayError = signal<string | null>(null);

  private readonly _goals = signal<Goal[]>(GOALS);
  readonly goals = this._goals.asReadonly();

  private readonly _actions = signal<WebAction[]>([]);
  readonly actions = computed(() => [...this._actions()].sort((a, b) => b.fecha.localeCompare(a.fecha)));

  private readonly _proposals = signal<Proposal[]>([]);
  /** Fichas de Google Maps (últimos 28 días) y cuándo se actualizaron. */
  readonly gbp = signal<{ periodo: string; actualizado: string; fichas: Partial<Record<SiteId, GbpData>> } | null>(null);
  readonly proposals = this._proposals.asReadonly();
  readonly pendingCount = computed(() => this._proposals().filter((p) => p.estado === 'pendiente').length);
  readonly notifications = computed(() => this.pendingCount() + this.unreadAvisos());

  private readonly chats = signal<Partial<Record<AgentId, ChatMessage[]>>>({});
  /** Agente que está pensando una respuesta ahora mismo */
  readonly thinking = signal<AgentId | null>(null);
  readonly chatError = signal<string | null>(null);
  /** Agentes trabajando en segundo plano (p. ej. respondiendo a un traspaso) */
  readonly working = signal<AgentId[]>([]);
  /** Último mensaje de cada chat, para la lista de conversaciones */
  readonly chatPreviews = signal<Partial<Record<AgentId, ChatPreview | null>>>({});

  constructor() {
    effect(() => {
      const s = this.sb.session();
      if (s) void this.loadAll();
      else if (s === null) this.reset();
    });
  }

  // ------------------------------------------------------------------ carga

  async loadAll(): Promise<void> {
    this.loading.set(true);
    await Promise.all([this.loadGoogleStatus(), this.loadGoals(), this.loadActions(), this.loadProposals(), this.loadGbp(),
      this.loadReports(), this.loadAvisos(), this.checkPush()]);
    if (!this.demo()) await this.loadFunnel(7, true);
    this.loading.set(false);
  }

  private reset(): void {
    this.funnels.set({});
    this.daily.set(null);
    this.queryCache.set({});
    this.todayCache.set({});
    this._actions.set([]);
    this._proposals.set([]);
    this._avisos.set([]);
    this.reports.set([]);
    this.chats.set({});
    this.google.set({ estado: 'cargando' });
  }

  async loadGoogleStatus(): Promise<void> {
    const { data, error } = await this.sb.client.rpc('integration_status');
    const g = (data as { proveedor: string; connected_at: string; last_sync_at: string; last_error: string }[] | null)
      ?.find((r) => r.proveedor === 'google');
    if (error || !g?.connected_at) {
      this.google.set({ estado: 'sin_conectar' });
      return;
    }
    this.google.set({
      estado: 'conectado',
      conectadoEl: g.connected_at,
      ultimaSync: g.last_sync_at ?? undefined,
      error: g.last_error ?? undefined,
    });
  }

  async loadFunnel(days: number, force = false): Promise<void> {
    if (this.demo() || (!force && this.funnels()[days])) return;
    const { data, error } = await this.sb.client.rpc('funnel_summary', { p_days: days });
    if (error || !data) return;
    const rows = data as FunnelRow[];
    const rec = {} as Record<SiteId, FunnelData>;
    for (const r of rows) {
      rec[r.site_id] = {
        vieron: +r.vieron, vieronPrev: +r.vieron_prev,
        entraron: +r.entraron, entraronPrev: +r.entraron_prev,
        contactaron: +r.contactaron, contactaronPrev: +r.contactaron_prev,
      };
    }
    this.datosHasta.set(rows.map((r) => r.datos_hasta).sort().at(-1) ?? null);
    this.funnels.update((f) => ({ ...f, [days]: rec }));
  }

  /** Métricas día a día de las 3 webs (para comparar su evolución). */
  readonly daily = signal<DailyPoint[] | null>(null);

  async loadDaily(days = 60, force = false): Promise<void> {
    if (!force && this.daily()) return;
    if (this.demo()) {
      this.daily.set(demoDaily(days));
      return;
    }
    const desde = new Date(Date.now() - (days + 3) * 86_400_000).toISOString().slice(0, 10);
    const { data } = await this.sb.client
      .from('metrics_daily')
      .select('site_id, fecha, impresiones, clics, usuarios, conversiones')
      .gte('fecha', desde)
      .order('fecha');
    this.daily.set((data ?? []).map((d) => ({
      siteId: d.site_id as SiteId, fecha: d.fecha as string,
      impresiones: d.impresiones, clics: d.clics, usuarios: d.usuarios, conversiones: d.conversiones,
    })));
  }

  async loadQueries(site: SiteId, days: number, force = false): Promise<void> {
    const key = `${site}-${days}`;
    if (this.demo() || (!force && this.queryCache()[key])) return;
    const { data } = await this.sb.client.rpc('top_queries', { p_site: site, p_days: days, p_limit: 10 });
    const list = ((data ?? []) as { consulta: string; vieron: number; entraron: number; puesto: number; solicitudes: number }[])
      .map((q) => ({ consulta: q.consulta, vieron: +q.vieron, entraron: +q.entraron, puesto: Math.round(+q.puesto), solicitudes: +q.solicitudes }));
    this.queryCache.update((c) => ({ ...c, [key]: list }));
  }

  async loadToday(site: SiteId): Promise<void> {
    if (this.demo()) return;
    this.todayError.set(null);
    try {
      const r = await this.sb.fn<{ ok: boolean; error?: string } & TodayData>('sync-google', { action: 'today', site });
      if (!r.ok) {
        this.todayError.set(r.error ?? 'No pude leer el tiempo real.');
        return;
      }
      this.todayCache.update((c) => ({ ...c, [site]: { ahora: r.ahora, hoy: r.hoy, horas: r.horas } }));
    } catch (e) {
      this.todayError.set((e as Error).message);
    }
  }

  private async loadGoals(): Promise<void> {
    const month = new Date();
    const mes = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-01`;
    const [{ data: goals }, { data: metrics }] = await Promise.all([
      this.sb.client.from('goals').select('site_id, solicitudes_objetivo').eq('mes', mes),
      this.sb.client.from('metrics_daily').select('site_id, conversiones').gte('fecha', mes),
    ]);
    const actual = (id: string) =>
      (metrics ?? []).filter((m) => m.site_id === id).reduce((n, m) => n + (m.conversiones ?? 0), 0);
    this._goals.set(this.sites.map((s) => ({
      siteId: s.id,
      objetivo: (goals ?? []).find((g) => g.site_id === s.id)?.solicitudes_objetivo ?? 20,
      actual: actual(s.id),
    })));
  }

  private async loadActions(): Promise<void> {
    const { data } = await this.sb.client
      .from('actions')
      .select('id, fecha, site_id, tipo, titulo, detalle, efecto, efecto_dir, enlace')
      .order('fecha', { ascending: false })
      .limit(300);
    this._actions.set((data ?? []).map((a) => ({
      id: a.id, fecha: a.fecha, siteId: a.site_id, tipo: a.tipo, titulo: a.titulo,
      detalle: a.detalle ?? undefined, efecto: a.efecto ?? undefined, efectoDir: a.efecto_dir ?? undefined,
      enlace: a.enlace ?? undefined,
    })));
  }

  // ------------------------------------------------------------------ Google

  /** Abre la pantalla de permiso de Google (todo el intercambio se hace en el servidor). */
  async connectGoogle(): Promise<string | null> {
    try {
      const r = await this.sb.fn<{ url?: string; error?: string }>('google-oauth', {
        returnTo: `${window.location.origin}/webs`,
      });
      if (!r.url) return r.error ?? 'No se pudo abrir Google.';
      window.location.href = r.url;
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  }

  /** Trae los datos de Google ahora mismo. La primera vez, 90 días. */
  async syncNow(days = 5): Promise<string | null> {
    this.syncing.set(true);
    try {
      const r = await this.sb.fn<{ ok: boolean; error?: string; problemas?: string[] }>('sync-google', { action: 'sync', days });
      this.funnels.set({});
      this.daily.set(null);
      this.queryCache.set({});
      await this.loadAll();
      return r.ok ? null : r.error ?? 'No se pudieron traer los datos.';
    } catch (e) {
      return (e as Error).message;
    } finally {
      this.syncing.set(false);
    }
  }

  // ------------------------------------------------------------------ lectura

  site(id: SiteId): Site {
    return this.sites.find((s) => s.id === id)!;
  }

  agent(id: AgentId): Agent {
    return this.agents.find((a) => a.id === id)!;
  }

  funnel(filter: SiteFilter, days = 7): FunnelData {
    const src: Record<SiteId, FunnelData> = this.demo()
      ? this.scaled(days)
      : (this.funnels()[days] ?? ({} as Record<SiteId, FunnelData>));
    if (filter !== 'todas') return src[filter] ?? EMPTY;
    return Object.values(src).reduce(
      (acc, f) => ({
        vieron: acc.vieron + f.vieron, vieronPrev: acc.vieronPrev + f.vieronPrev,
        entraron: acc.entraron + f.entraron, entraronPrev: acc.entraronPrev + f.entraronPrev,
        contactaron: acc.contactaron + f.contactaron, contactaronPrev: acc.contactaronPrev + f.contactaronPrev,
      }),
      EMPTY,
    );
  }

  private scaled(days: number): Record<SiteId, FunnelData> {
    const k = DEMO_FACTOR(days);
    const r = (n: number) => Math.round(n * k);
    const out = {} as Record<SiteId, FunnelData>;
    for (const [id, f] of Object.entries(FUNNEL) as [SiteId, FunnelData][]) {
      out[id] = {
        vieron: r(f.vieron), vieronPrev: r(f.vieronPrev), entraron: r(f.entraron), entraronPrev: r(f.entraronPrev),
        contactaron: r(f.contactaron), contactaronPrev: r(f.contactaronPrev),
      };
    }
    return out;
  }

  hourly(id: SiteId): HourlyVisits[] {
    return this.demo() ? HOURLY[id] : (this.todayCache()[id]?.horas ?? []);
  }

  liveNow(id: SiteId): number | null {
    return this.demo() ? LIVE_NOW[id] : (this.todayCache()[id]?.ahora ?? null);
  }

  todayTotal(id: SiteId): number | null {
    if (this.demo()) {
      const h = new Date().getHours();
      return HOURLY[id].filter((x) => x.hora <= h).reduce((n, x) => n + x.personas, 0);
    }
    return this.todayCache()[id]?.hoy ?? null;
  }

  queries(id: SiteId, days = 7): SearchQuery[] | null {
    return this.demo() ? QUERIES[id] : (this.queryCache()[`${id}-${days}`] ?? null);
  }

  /** Mensajes del chat con un agente, con sus avisos de la revisión diaria intercalados por fecha. */
  messages(agentId: AgentId): ChatMessage[] {
    const msgs = this.chats()[agentId] ?? [];
    const avisos: ChatMessage[] = this._avisos()
      .filter((a) => a.agentId === agentId && !esTraspaso(a.titulo))
      .map((a) => ({
        id: `aviso-${a.id}`,
        rol: 'agente' as const,
        texto: a.texto,
        createdAt: a.createdAt,
        aviso: { id: a.id, titulo: a.titulo, siteId: a.siteId },
      }));
    if (!avisos.length) return msgs;
    // Los mensajes sin fecha (recién enviados) van siempre al final.
    const t = (m: ChatMessage) => (m.createdAt ? new Date(m.createdAt).getTime() : Number.MAX_SAFE_INTEGER);
    return [...msgs, ...avisos].sort((a, b) => t(a) - t(b));
  }

  /** Avisos sin leer de cada agente (el globito). */
  unreadFor(agentId: AgentId): number {
    return this._avisos().filter((a) => a.agentId === agentId && !a.leido).length;
  }

  /** Al abrir el chat de un agente, sus avisos se dan por leídos. */
  async markAgentRead(agentId: AgentId): Promise<void> {
    const ids = this._avisos().filter((a) => a.agentId === agentId && !a.leido).map((a) => a.id);
    if (ids.length) await this.markAvisosRead(ids);
  }

  async loadChatPreviews(): Promise<void> {
    try {
      const r = await this.sb.fn<{ ok: boolean; chats?: Record<AgentId, { contenido: string; rol: string; created_at: string } | null> }>(
        'agent-chat', { action: 'overview' });
      if (!r.ok || !r.chats) return;
      const out: Partial<Record<AgentId, ChatPreview | null>> = {};
      for (const [id, m] of Object.entries(r.chats) as [AgentId, { contenido: string; rol: string; created_at: string } | null][]) {
        out[id] = m ? { texto: m.contenido, rol: m.rol, createdAt: m.created_at } : null;
      }
      this.chatPreviews.set(out);
    } catch {
      /* sin conexión */
    }
  }

  /** Un agente revisa tus webs ahora y te escribe en su chat (en segundo plano). */
  async reviewAgent(agentId: AgentId, foco = ''): Promise<string | null> {
    if (this.working().includes(agentId) || this.thinking() === agentId) return null;
    this.working.update((w) => [...w, agentId]);
    try {
      await this.loadChat(agentId);
      const pedido: ChatMessage = {
        id: crypto.randomUUID(), rol: 'yo', createdAt: new Date().toISOString(),
        texto: foco ? `Revisión pedida. Fíjate sobre todo en: ${foco}` : 'Revisión pedida: revisa ahora mis webs.',
      };
      this.chats.update((c) => ({ ...c, [agentId]: [...(c[agentId] ?? []), pedido] }));
      const r = await this.sb.fn<{ ok: boolean; error?: string; mensaje?: DbMessage | null }>('agent-chat', {
        action: 'review', agent: agentId, foco,
      });
      if (!r.ok) return r.error ?? 'No pudo revisar.';
      await this.loadChat(agentId, true);
      return null;
    } catch (e) {
      return (e as Error).message;
    } finally {
      this.working.update((w) => w.filter((x) => x !== agentId));
      void this.loadChatPreviews();
      void this.loadAvisos();
      void this.loadProposals();
    }
  }

  /** Todo el equipo revisa a la vez. Devuelve los errores que haya, o null. */
  readonly reviewing = computed(() => this.working().length > 0);

  async reviewAll(foco = ''): Promise<string | null> {
    const errs = (await Promise.all(this.agents.map((a) => this.reviewAgent(a.id, foco)))).filter(Boolean);
    return errs.length ? (errs[0] as string) : null;
  }

  /** El agente que ha recibido un traspaso lo lee y responde con su plan (en segundo plano). */
  async continueAgent(agentId: AgentId): Promise<void> {
    if (this.working().includes(agentId)) return;
    this.working.update((w) => [...w, agentId]);
    try {
      await this.loadChat(agentId, true);
      const r = await this.sb.fn<{ ok: boolean; mensaje?: DbMessage | null }>('agent-chat', { action: 'continue', agent: agentId });
      if (r.ok && r.mensaje) {
        this.chats.update((c) => ({ ...c, [agentId]: [...(c[agentId] ?? []), toChat(r.mensaje!)] }));
        if (r.mensaje.adjuntos_json?.propuestas?.length) await this.loadProposals();
      }
    } catch {
      /* se verá al volver a abrir el chat */
    } finally {
      this.working.update((w) => w.filter((x) => x !== agentId));
      void this.loadChatPreviews();
      void this.loadAvisos();
    }
  }

  // ------------------------------------------------------------------ escritura

  /** Carga la conversación guardada con un agente. */
  async loadChat(agentId: AgentId, force = false): Promise<void> {
    if (!force && this.chats()[agentId]) return;
    try {
      const r = await this.sb.fn<{ ok: boolean; mensajes?: DbMessage[] }>('agent-chat', { action: 'history', agent: agentId });
      if (r.ok) this.chats.update((c) => ({ ...c, [agentId]: (r.mensajes ?? []).map(toChat) }));
    } catch {
      /* sin conexión: se queda vacío */
    }
  }

  /** Empieza una conversación nueva con el agente (la anterior queda guardada). */
  async resetChat(agentId: AgentId): Promise<void> {
    await this.sb.fn('agent-chat', { action: 'reset', agent: agentId });
    this.chats.update((c) => ({ ...c, [agentId]: [] }));
  }

  async send(agentId: AgentId, texto: string): Promise<void> {
    if (this.thinking()) return;
    this.chatError.set(null);
    const mine: ChatMessage = { id: crypto.randomUUID(), rol: 'yo', texto, createdAt: new Date().toISOString() };
    this.chats.update((c) => ({ ...c, [agentId]: [...(c[agentId] ?? []), mine] }));
    this.thinking.set(agentId);
    try {
      const r = await this.sb.fn<{ ok: boolean; error?: string; mensaje?: DbMessage }>('agent-chat', {
        action: 'send', agent: agentId, texto,
      });
      if (!r.ok || !r.mensaje) {
        this.chatError.set(r.error ?? 'No he podido responder.');
        return;
      }
      this.chats.update((c) => ({ ...c, [agentId]: [...(c[agentId] ?? []), toChat(r.mensaje!)] }));
      const adj = r.mensaje.adjuntos_json;
      if (adj?.propuestas?.length || adj?.traspasos?.length) await this.loadProposals();
      // Traspasos: el otro agente lo recibe en su chat y se pone a trabajar.
      for (const t of adj?.traspasos ?? []) void this.continueAgent(t.agente);
      if (adj?.traspasos?.length) void this.loadAvisos();
    } catch (e) {
      this.chatError.set((e as Error).message);
    } finally {
      void this.loadChatPreviews();
      this.thinking.set(null);
    }
  }

  async loadReports(): Promise<void> {
    const { data } = await this.sb.client.from('weekly_reports')
      .select('id, semana_inicio, resumen, contenido_json').order('semana_inicio', { ascending: false }).limit(26);
    this.reports.set((data ?? []).map((r) => {
      const c = (r.contenido_json ?? {}) as Partial<WeeklyReport>;
      return {
        id: r.id, semanaInicio: r.semana_inicio, semanaFin: c.semanaFin ?? r.semana_inicio, resumen: r.resumen,
        filas: c.filas ?? [], equipo: c.equipo ?? [], recomendaciones: c.recomendaciones ?? [],
      };
    }));
  }

  async loadAvisos(): Promise<void> {
    const { data } = await this.sb.client.from('avisos')
      .select('id, agent_id, site_id, titulo, texto, enlace, leido, created_at').order('created_at', { ascending: false }).limit(50);
    this._avisos.set((data ?? []).map((a) => ({
      id: a.id, agentId: a.agent_id, siteId: a.site_id, titulo: a.titulo, texto: a.texto,
      enlace: a.enlace, leido: a.leido, createdAt: a.created_at,
    })));
  }

  async markAvisosRead(ids?: string[]): Promise<void> {
    const target = ids ?? this._avisos().filter((a) => !a.leido).map((a) => a.id);
    if (!target.length) return;
    this._avisos.update((l) => l.map((a) => (target.includes(a.id) ? { ...a, leido: true } : a)));
    await this.sb.client.from('avisos').update({ leido: true }).in('id', target);
  }

  /** Actualiza todo: datos de Google y lo que hay en Webby (avisos, propuestas, fichas, informes). */
  async refreshAll(): Promise<string | null> {
    if (this.refreshing()) return null;
    this.refreshing.set(true);
    try {
      const err = this.google().estado === 'conectado' ? await this.syncNow(5) : null;
      if (!err) await this.loadAll();
      await this.refreshPrs();
      return err;
    } finally {
      this.refreshing.set(false);
    }
  }

  /** Pide a los agentes su revisión ahora mismo (normalmente se hace sola a las 7:00). */
  async runAgentsNow(): Promise<string | null> {
    try {
      const r = await this.sb.fn<{ ok: boolean; error?: string }>('webby-avisos', { action: 'diario' });
      await Promise.all([this.loadAvisos(), this.loadProposals(), this.loadReports()]);
      return r.ok ? null : r.error ?? 'Los agentes no pudieron revisar ahora.';
    } catch (e) {
      return (e as Error).message;
    }
  }

  // ------------------------------------------------------------------ notificaciones al móvil

  private pushSupported(): boolean {
    return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }

  async checkPush(): Promise<void> {
    if (!this.pushSupported()) return this.push.set('no_soportado');
    if (Notification.permission === 'denied') return this.push.set('bloqueado');
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = await reg?.pushManager.getSubscription();
    this.push.set(sub && Notification.permission === 'granted' ? 'activado' : 'apagado');
  }

  async enablePush(): Promise<string | null> {
    if (!this.pushSupported()) {
      return 'Este navegador no admite notificaciones. En iPhone, primero añade Webby a la pantalla de inicio y ábrelo desde allí.';
    }
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        this.push.set(perm === 'denied' ? 'bloqueado' : 'apagado');
        return 'No diste permiso para las notificaciones.';
      }
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
      const k = await this.sb.fn<{ ok: boolean; publicKey?: string }>('webby-avisos', { action: 'clave' });
      if (!k.publicKey) return 'No se pudo preparar el servidor de avisos.';
      const sub = (await reg.pushManager.getSubscription())
        ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64(k.publicKey) }));
      const r = await this.sb.fn<{ ok: boolean; error?: string }>('webby-avisos', { action: 'suscribir', sub: sub.toJSON() });
      if (!r.ok) return r.error ?? 'No se pudo guardar este móvil.';
      this.push.set('activado');
      return null;
    } catch (e) {
      return 'No se pudieron activar: ' + (e as Error).message;
    }
  }

  async disablePush(): Promise<void> {
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await this.sb.fn('webby-avisos', { action: 'quitar', endpoint: sub.endpoint }).catch(() => null);
      await sub.unsubscribe();
    }
    this.push.set('apagado');
  }

  async testPush(): Promise<string | null> {
    try {
      const r = await this.sb.fn<{ ok: boolean; error?: string }>('webby-avisos', { action: 'probar' });
      return r.ok ? null : r.error ?? 'No se pudo enviar la prueba.';
    } catch (e) {
      return (e as Error).message;
    }
  }

  async loadGbp(): Promise<void> {
    const { data } = await this.sb.client.from('snapshots').select('datos, actualizado').eq('clave', 'gbp_28').maybeSingle();
    if (!data) return;
    const { periodo, ...fichas } = data.datos as { periodo: string } & Partial<Record<SiteId, GbpData>>;
    this.gbp.set({ periodo, actualizado: data.actualizado, fichas });
  }

  async loadProposals(): Promise<void> {
    const { data } = await this.sb.client
      .from('proposals')
      .select('id, agent_id, idea_de, site_id, titulo, que, porque, archivos_json, rama, pr_url, estado, created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    this._proposals.set((data ?? []).map((p) => ({
      id: p.id, agentId: p.agent_id, ideaDe: p.idea_de ?? undefined, siteId: p.site_id, titulo: p.titulo,
      que: p.que, porque: p.porque, archivos: p.archivos_json ?? [], rama: p.rama ?? undefined, prUrl: p.pr_url ?? undefined,
      estado: p.estado, createdAt: p.created_at,
    })));
  }

  /** Pide a Desarrollo que haga el cambio en GitHub (rama + Pull Request). */
  async launchPr(id: string): Promise<string | null> {
    try {
      const r = await this.sb.fn<{ ok: boolean; error?: string; rama?: string }>('desarrollo-pr', { action: 'lanzar', id });
      if (!r.ok) return r.error ?? 'No se pudo lanzar el cambio.';
      this._proposals.update((list) => list.map((x) => (x.id === id ? { ...x, estado: 'en_progreso', rama: r.rama } : x)));
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  }

  /** Comprueba en GitHub si los cambios en marcha ya tienen Pull Request o se han fusionado. */
  async refreshPrs(): Promise<void> {
    if (!this._proposals().some((p) => p.estado === 'en_progreso' || p.estado === 'pr_abierto')) return;
    try {
      const r = await this.sb.fn<{ ok: boolean; cambios?: number }>('desarrollo-pr', { action: 'estado' });
      if (r.ok) await this.loadProposals();
    } catch {
      /* sin conexión: se mira la próxima vez */
    }
  }

  /** Aprobar / rechazar una propuesta (se guarda en Supabase). */
  setProposalState(id: string, estado: ProposalState): void {
    const p = this._proposals().find((x) => x.id === id);
    if (!p) return;
    this._proposals.update((list) => list.map((x) => (x.id === id ? { ...x, estado } : x)));
    void this.sb.client.from('proposals')
      .update({ estado, decided_at: estado === 'pendiente' ? null : new Date().toISOString() })
      .eq('id', id)
      .then(({ error }) => {
        if (error) this._proposals.update((list) => list.map((x) => (x.id === id ? p : x)));
      });
    const logId = `prop-${id}`;
    this._actions.update((list) => list.filter((a) => a.id !== logId));
    if (estado === 'aprobada' || estado === 'rechazada') {
      this._actions.update((list) => [{
        id: logId,
        fecha: new Date().toISOString(),
        siteId: p.siteId,
        tipo: estado,
        titulo: `${estado === 'aprobada' ? 'Aprobaste' : 'Rechazaste'} «${p.titulo}»`,
        detalle: estado === 'aprobada' && p.archivos.length ? 'Desarrollo preparará el cambio en una rama aparte.' : undefined,
      }, ...list]);
    }
  }

  async setGoal(siteId: SiteId, objetivo: number): Promise<void> {
    const prev = this._goals().find((g) => g.siteId === siteId);
    if (!prev || prev.objetivo === objetivo) return;
    this._goals.update((gs) => gs.map((g) => (g.siteId === siteId ? { ...g, objetivo } : g)));
    const now = new Date();
    const mes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const { error } = await this.sb.client.from('goals').upsert({ site_id: siteId, mes, solicitudes_objetivo: objetivo });
    if (error) {
      this._goals.update((gs) => gs.map((g) => (g.siteId === siteId ? prev : g)));
      return;
    }
    const action: WebAction = {
      id: crypto.randomUUID(),
      fecha: now.toISOString(),
      siteId,
      tipo: 'objetivo',
      titulo: `${objetivo > prev.objetivo ? 'Subiste' : 'Bajaste'} el objetivo de ${this.site(siteId).nombre} a ${objetivo} solicitudes al mes`,
    };
    this._actions.update((list) => [action, ...list]);
    await this.sb.client.from('actions').insert({
      id: action.id, fecha: action.fecha, site_id: siteId, tipo: 'objetivo', titulo: action.titulo,
    });
  }
}
