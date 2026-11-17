// Chat con los agentes de Webby (Claude).
//  { action: "history", agent }          -> mensajes guardados de ese agente
//  { action: "send", agent, texto }      -> guarda tu mensaje, pregunta a Claude y guarda la respuesta
//  { action: "continue", agent }         -> el agente responde a un traspaso que le acaban de hacer
//  { action: "overview" }                -> último mensaje de cada agente (para la lista de chats)
//  { action: "review", agent, foco? }    -> el agente revisa las webs ahora y te escribe (con aviso y globito)
// Los agentes pueden pasarse trabajo entre ellos con la herramienta pasar_a_agente.
// Solo el dueño de Webby. La clave de Claude va en el secreto ANTHROPIC_API_KEY de Supabase.
import Anthropic from 'npm:@anthropic-ai/sdk@1.9.0';
import { betaTool } from 'npm:@anthropic-ai/sdk@1.9.0/helpers/beta/json-schema';
import { createClient } from 'npm:@supabase/supabase-js@2';

const MODEL = 'claude-opus-5-5';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  db: { schema: 'webby' },
  auth: { persistSession: false },
});

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

type AgentId = 'seo' | 'marketing' | 'anuncios' | 'competencia' | 'desarrollo';

// ---------------------------------------------------------------- personalidades
const COMUN = `Trabajas para Luis, dueño de tres negocios de servicios en Madrid con su propia web cada uno:
- ArmaMuebles (id armamuebles) · https://armamuebles.es · montaje de muebles a domicilio.
- ObraLocal (id obralocal) · https://obralocalmadrid.es · reformas (cocinas, baños, pisos).
- Mudanzas360 (id mudanzas) · https://mudanzas360.es · mudanzas y portes.
El código de cada web está en GitHub: lui15/ARMAMUEBLES, lui15/OBRA-LOCAL-MADRID, lui15/MUDANZAS360.

Eres uno de los cinco agentes de Webby, su panel: SEO, Marketing, Anuncios, Competencia y Desarrollo.
Luis no es técnico. Háblale en español de España, de tú, claro y directo, sin jerga (si usas un término como "CTR", explícalo en pocas palabras).
Respuestas cortas: lo importante primero, como mucho 3-5 puntos, y termina con el siguiente paso concreto.
Usa solo los datos que te doy o lo que compruebes con tus herramientas. Si un dato no está, dilo; nunca te lo inventes.
Puedes consultar las webs y buscar en Google con tus herramientas cuando haga falta (por ejemplo, para ver una página o a la competencia).
Cuando propongas un cambio concreto en una web y Luis esté de acuerdo o te lo pida, usa la herramienta crear_propuesta: quedará en "Propuestas" para que la apruebe; si la aprueba, Desarrollo preparará el cambio en GitHub. No digas que has cambiado nada en la web: tú solo propones.
Escribe en texto plano: sin tablas ni encabezados Markdown; puedes usar guiones para listas y **negrita** con moderación.

Trabajo en equipo:
- Si Luis te pide pasar algo a otro agente («pásala a Desarrollo», «que lo vea Marketing»), o si es claramente trabajo de otro, usa pasar_a_agente. Incluye un resumen completo (qué es, datos, qué se ha decidido, qué falta) para que el otro siga sin volver a preguntar. Si es sobre una propuesta, pasa su id. Después dile a Luis en una frase que ya lo tiene el otro agente.
- Si en la conversación aparece una «Nota de Webby» diciendo que otro agente te ha pasado algo, empieza por ahí: di en una frase qué te han pasado y propón tu plan concreto (y crea la propuesta si procede).
- Los avisos que enviaste en la revisión diaria aparecen en tus datos. Si Luis te pregunta por uno, continúa desde ese aviso.`;

const NOMBRE: Record<AgentId, string> = {
  seo: 'SEO', marketing: 'Marketing', anuncios: 'Anuncios', competencia: 'Competencia', desarrollo: 'Desarrollo',
};
const AGENTES = Object.keys(NOMBRE) as AgentId[];

const PERSONA: Record<AgentId, string> = {
  seo: `Eres el agente de SEO (Google y Maps). Tu objetivo: que las tres webs aparezcan más arriba en Google y en Google Maps para búsquedas locales de Madrid y que esas visitas se conviertan en llamadas o solicitudes. Te fijas en búsquedas, posiciones, títulos y descripciones, páginas por servicio y barrio, indexación, velocidad y la ficha de Google Business Profile.`,
  marketing: `Eres el agente de Marketing (contenido y confianza). Tu objetivo: que quien llega a la web confíe y pida presupuesto. Te fijas en textos, ofertas, fotos, reseñas de Google, pruebas sociales, botones de llamada y WhatsApp, y en ideas de contenido (guías, precios orientativos, casos reales).`,
  anuncios: `Eres el agente de Anuncios (Google Ads). Luis todavía no tiene campañas. Tu objetivo: proponer campañas pequeñas y medibles (búsqueda local o Servicios Locales) con presupuesto prudente, palabras clave, anuncios y páginas de destino, y explicar qué esperar. Nunca gastes dinero ni crees campañas: solo propones.`,
  competencia: `Eres el agente de Competencia (quién te supera). Tu objetivo: descubrir qué negocios aparecen por encima de las webs de Luis en Google y Maps para sus búsquedas importantes en Madrid, qué hacen mejor (precios, reseñas, páginas, ofertas) y qué se puede copiar o mejorar. Usa la búsqueda web para comprobarlo antes de afirmar nada.`,
  desarrollo: `Eres el agente de Desarrollo (código y diseño). Tu objetivo: que las webs sean rápidas, claras en el móvil, fáciles de contactar y técnicamente correctas (títulos, metadatos, datos estructurados, enlaces, formularios, eventos de conversión en GA4). Puedes abrir las páginas para revisarlas. Cuando propongas un cambio, di qué archivos o páginas tocarías y crea la propuesta para que Luis la apruebe; luego se convertirá en un Pull Request en GitHub.`,
};

// ---------------------------------------------------------------- auth
async function ownerId(req: Request): Promise<string | null> {
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: { user } } = await admin.auth.getUser(jwt);
  if (!user) return null;
  const { data } = await admin.from('owners').select('user_id').eq('user_id', user.id).maybeSingle();
  return data ? user.id : null;
}

// ---------------------------------------------------------------- datos para el agente
const fmt = (n: number) => Math.round(n).toLocaleString('es-ES');
const pct = (a: number, b: number) => (b ? `${a >= b ? '+' : ''}${Math.round(((a - b) / b) * 100)}%` : 'sin dato previo');

async function contexto(agent: AgentId): Promise<string> {
  const hoy = new Date();
  const desde = new Date(hoy.getTime() - 56 * 864e5).toISOString().slice(0, 10);
  const corte = new Date(hoy.getTime() - 28 * 864e5).toISOString().slice(0, 10);

  const [{ data: sites }, { data: metrics }, { data: props }, { data: integ }, { data: snaps }] = await Promise.all([
    admin.from('sites').select('id, nombre, dominio').order('id'),
    admin.from('metrics_daily').select('site_id, fecha, impresiones, clics, posicion_media, usuarios, sesiones, conversiones').gte('fecha', desde),
    admin.from('proposals').select('id, agent_id, idea_de, site_id, titulo, estado, created_at').order('created_at', { ascending: false }).limit(15),
    admin.from('integrations').select('proveedor, last_sync_at').eq('proveedor', 'google').maybeSingle(),
    admin.from('snapshots').select('clave, descripcion, datos, actualizado').order('clave'),
  ]);

  const lineas: string[] = [`Fecha de hoy: ${hoy.toISOString().slice(0, 10)}.`];
  const m = metrics ?? [];
  if (!m.length) {
    lineas.push('Métricas diarias de Search Console y Analytics: todavía no hay datos cargados en Webby.');
  } else {
    lineas.push('Resumen últimos 28 días (entre paréntesis, cambio frente a los 28 anteriores). Search Console va ~2 días retrasado.');
    for (const s of sites ?? []) {
      const rows = m.filter((r) => r.site_id === s.id);
      const sum = (k: string, recent: boolean) =>
        rows.filter((r) => (recent ? r.fecha >= corte : r.fecha < corte)).reduce((n, r) => n + (Number((r as Record<string, unknown>)[k]) || 0), 0);
      const rec = rows.filter((r) => r.fecha >= corte && r.impresiones);
      const pos = rec.length
        ? rec.reduce((n, r) => n + Number(r.posicion_media) * r.impresiones, 0) / rec.reduce((n, r) => n + r.impresiones, 0)
        : null;
      lineas.push(
        `- ${s.nombre}: vieron en Google ${fmt(sum('impresiones', true))} veces (${pct(sum('impresiones', true), sum('impresiones', false))}), ` +
          `clics ${fmt(sum('clics', true))} (${pct(sum('clics', true), sum('clics', false))}), posición media ${pos ? pos.toFixed(1) : '—'}; ` +
          `visitas (sesiones GA4) ${fmt(sum('sesiones', true))} (${pct(sum('sesiones', true), sum('sesiones', false))}), ` +
          `solicitudes/conversiones ${fmt(sum('conversiones', true))}.`,
      );
    }
    for (const s of sites ?? []) {
      const { data: q } = await admin.rpc('top_queries', { p_site: s.id, p_days: 28, p_limit: 12 });
      if (q?.length) {
        lineas.push(`Búsquedas principales de ${s.nombre} (28 días): ` +
          (q as { consulta: string; vieron: number; entraron: number; puesto: number }[])
            .map((x) => `«${x.consulta}» ${x.vieron} vistas, ${x.entraron} clics, puesto ${x.puesto}`).join('; ') + '.');
      }
    }
  }
  for (const sn of snaps ?? []) {
    lineas.push(`${sn.descripcion} (actualizado ${String(sn.actualizado).slice(0, 10)}): ${JSON.stringify(sn.datos)}`);
  }
  if (integ?.last_sync_at) lineas.push(`Última sincronización con Google: ${integ.last_sync_at}.`);
  if (props?.length) {
    lineas.push('Propuestas recientes (id entre corchetes, para pasar_a_agente): ' + props.map((p) =>
      `[${p.id}] ${p.titulo} — ${p.estado}, web ${p.site_id}, de ${p.agent_id}${p.idea_de ? ` (idea de ${p.idea_de})` : ''}`).join('; ') + '.');
  }
  const { data: avisos } = await admin.from('avisos').select('site_id, titulo, texto, created_at')
    .eq('agent_id', agent).order('created_at', { ascending: false }).limit(8);
  if (avisos?.length) {
    lineas.push('Avisos que tú (este agente) le has enviado a Luis, del más reciente al más antiguo:\n' +
      avisos.map((a) => `- ${String(a.created_at).slice(0, 10)} · ${a.site_id ?? 'todas'} · «${a.titulo}»: ${a.texto}`).join('\n'));
  }
  return lineas.join('\n');
}

// ---------------------------------------------------------------- conversación
async function conversacion(agent: AgentId): Promise<string> {
  const { data } = await admin.from('conversations').select('id').eq('agent_id', agent)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (data) return data.id;
  const { data: nueva, error } = await admin.from('conversations').insert({ agent_id: agent }).select('id').single();
  if (error) throw error;
  return nueva.id;
}

interface Msg {
  id: string;
  rol: 'yo' | 'agente';
  contenido: string;
  adjuntos_json: { traspaso?: { de: AgentId; titulo: string; propuesta_id?: string } } | null;
  created_at: string;
}

async function historial(convId: string, limit = 40): Promise<Msg[]> {
  const { data } = await admin.from('messages').select('id, rol, contenido, adjuntos_json, created_at')
    .eq('conversation_id', convId).order('created_at', { ascending: false }).limit(limit);
  return ((data ?? []) as Msg[]).reverse();
}

/** Historial en el formato de Claude: las notas de traspaso van como mensaje del usuario,
 *  los turnos seguidos del mismo rol se unen y siempre se empieza por el usuario. */
function paraClaude(msgs: Msg[]) {
  const out: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const m of msgs) {
    const t = m.adjuntos_json?.traspaso;
    const role = m.rol === 'yo' || t ? 'user' : 'assistant';
    const content = t ? `[Nota de Webby] ${m.contenido}` : m.contenido;
    const last = out.at(-1);
    if (last && last.role === role) last.content += `\n\n${content}`;
    else out.push({ role, content });
  }
  if (out[0]?.role === 'assistant') out.unshift({ role: 'user', content: '(Luis abre el chat)' });
  return out;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------- un turno del agente
async function responder(agent: AgentId, convId: string, apiKey: string) {
  const previos = await historial(convId, 30);
  const propuestas: { id: string; titulo: string }[] = [];
  const traspasos: { agente: AgentId; titulo: string }[] = [];

  const crearPropuesta = betaTool({
    name: 'crear_propuesta',
    description:
      'Guarda una propuesta de mejora concreta para una de las webs en la sección Propuestas de Webby, para que Luis la apruebe o rechace. Úsala solo para cambios concretos y accionables.',
    inputSchema: {
      type: 'object',
      properties: {
        site_id: { type: 'string', enum: ['armamuebles', 'obralocal', 'mudanzas'], description: 'Web a la que afecta' },
        titulo: { type: 'string', description: 'Título corto, p. ej. "Crear página de montaje de armarios PAX"' },
        que: { type: 'string', description: 'Qué cambiar exactamente, en lenguaje sencillo' },
        porque: { type: 'string', description: 'Por qué ayudará, con el dato que lo justifica' },
        archivos: {
          type: 'array',
          items: { type: 'string' },
          description: 'Rutas o páginas que se tocarían, si se conocen (puede ir vacío)',
        },
      },
      required: ['site_id', 'titulo', 'que', 'porque', 'archivos'],
      additionalProperties: false,
    },
    run: async (input: { site_id: string; titulo: string; que: string; porque: string; archivos: string[] }) => {
      const { data, error } = await admin.from('proposals').insert({
        agent_id: agent,
        site_id: input.site_id,
        titulo: input.titulo.slice(0, 200),
        que: input.que,
        porque: input.porque,
        archivos_json: (input.archivos ?? []).map((ruta) => ({ ruta, tipo: 'modificado' })),
      }).select('id').single();
      if (error) return `No se pudo guardar: ${error.message}`;
      propuestas.push({ id: data.id, titulo: input.titulo });
      return `Propuesta guardada en Webby › Propuestas (id ${data.id}). Luis la verá allí para aprobarla.`;
    },
  });

  const otros = AGENTES.filter((a) => a !== agent);
  const pasarAAgente = betaTool({
    name: 'pasar_a_agente',
    description:
      'Pasa un tema o una propuesta a otro agente de Webby para que siga trabajando con ello. Deja una nota con el resumen en el chat de ese agente, le avisa a Luis y, si hay propuesta, se la reasigna.',
    inputSchema: {
      type: 'object',
      properties: {
        agente: { type: 'string', enum: otros, description: 'Agente que recibe el trabajo' },
        titulo: { type: 'string', description: 'Qué se le pasa, en pocas palabras' },
        resumen: {
          type: 'string',
          description: 'Resumen completo para que el otro agente continúe sin preguntar: qué es, datos, qué se ha decidido con Luis y qué falta por hacer',
        },
        web: { type: 'string', enum: ['armamuebles', 'obralocal', 'mudanzas', 'todas'], description: 'Web a la que afecta' },
        propuesta_id: { type: 'string', description: 'Id de la propuesta si se pasa una propuesta concreta (opcional)' },
      },
      required: ['agente', 'titulo', 'resumen', 'web'],
      additionalProperties: false,
    },
    run: async (input: { agente: AgentId; titulo: string; resumen: string; web: string; propuesta_id?: string }) => {
      if (!otros.includes(input.agente)) return 'Ese agente no existe.';
      const destino = await conversacion(input.agente);
      const titulo = input.titulo.slice(0, 120);
      const propuestaId = input.propuesta_id && UUID.test(input.propuesta_id) ? input.propuesta_id : undefined;

      const { error } = await admin.from('messages').insert({
        conversation_id: destino,
        rol: 'agente',
        contenido: `${NOMBRE[agent]} te ha pasado: ${titulo}\n\n${input.resumen}`,
        adjuntos_json: { traspaso: { de: agent, titulo, propuesta_id: propuestaId } },
      });
      if (error) return `No se pudo pasar: ${error.message}`;

      if (propuestaId) {
        await admin.from('proposals').update({ agent_id: input.agente, idea_de: agent }).eq('id', propuestaId);
      }
      await admin.from('avisos').insert({
        agent_id: input.agente,
        site_id: input.web === 'todas' ? null : input.web,
        titulo: `${NOMBRE[agent]} te ha pasado: ${titulo}`.slice(0, 120),
        texto: input.resumen.slice(0, 600),
        enlace: `/agentes?a=${input.agente}`,
      });
      traspasos.push({ agente: input.agente, titulo });
      const extra = propuestaId ? ' y la propuesta ahora es suya' : '';
      return `Hecho: ${NOMBRE[input.agente]} ya lo tiene en su chat${extra}. Empezará a trabajar en ello enseguida.`;
    },
  });

  const client = new Anthropic({ apiKey });
  const final = await client.beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium' },
    max_iterations: 8,
    system: [
      { type: 'text', text: `${COMUN}\n\n${PERSONA[agent]}`, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: `Datos actuales de Webby:\n${await contexto(agent)}` },
    ],
    tools: [
      crearPropuesta,
      pasarAAgente,
      { type: 'web_search_20260209', name: 'web_search', max_uses: 4, user_location: { type: 'approximate', city: 'Madrid', country: 'ES', timezone: 'Europe/Madrid' } },
      { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 4 },
    ],
    messages: paraClaude(previos),
  } as never).runUntilDone();

  let respuesta = final.content
    .filter((b: { type: string }) => b.type === 'text')
    .map((b: { text: string }) => b.text)
    .join('')
    .trim();
  if (final.stop_reason === 'refusal') respuesta = 'No puedo ayudarte con eso. Prueba a preguntarlo de otra forma.';
  if (!respuesta) respuesta = 'No he podido terminar la respuesta. ¿Lo intentas otra vez?';

  const adjuntos: Record<string, unknown> = {};
  if (propuestas.length) adjuntos.propuestas = propuestas;
  if (traspasos.length) adjuntos.traspasos = traspasos;
  const { data: guardado } = await admin.from('messages')
    .insert({ conversation_id: convId, rol: 'agente', contenido: respuesta, adjuntos_json: Object.keys(adjuntos).length ? adjuntos : null })
    .select('id, rol, contenido, adjuntos_json, created_at').single();
  return guardado;
}

// ---------------------------------------------------------------- lista de chats
async function overview() {
  const out: Record<string, { contenido: string; rol: string; created_at: string } | null> = {};
  await Promise.all(AGENTES.map(async (a) => {
    const { data: conv } = await admin.from('conversations').select('id').eq('agent_id', a)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (!conv) {
      out[a] = null;
      return;
    }
    const { data: m } = await admin.from('messages').select('contenido, rol, created_at')
      .eq('conversation_id', conv.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
    out[a] = m ?? null;
  }));
  return out;
}

// ---------------------------------------------------------------- handler
function mensajeError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return 'La clave de Claude no es válida.';
  if (e instanceof Anthropic.RateLimitError) return 'Claude está saturado ahora mismo; prueba en un minuto.';
  if (e instanceof Anthropic.APIError && /credit|billing/i.test((e as Error).message)) {
    return 'Tu cuenta de Claude no tiene saldo. Añade crédito en console.anthropic.com.';
  }
  return 'No he podido responder. Inténtalo otra vez en un momento.';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    if (!(await ownerId(req))) return json({ ok: false, error: 'No tienes permiso.' }, 401);
    const body = await req.json().catch(() => ({}));

    if (body.action === 'overview') return json({ ok: true, chats: await overview() });

    const agent = body.agent as AgentId;
    if (!(agent in PERSONA)) return json({ ok: false, error: 'Agente desconocido.' }, 400);

    const convId = await conversacion(agent);

    if (body.action === 'history') return json({ ok: true, mensajes: await historial(convId) });

    if (body.action === 'reset') {
      const { data } = await admin.from('conversations').insert({ agent_id: agent }).select('id').single();
      return json({ ok: true, conversacion: data?.id });
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return json({ ok: false, error: 'Falta la clave de Claude (ANTHROPIC_API_KEY) en los secretos de Supabase.' });
    }

    if (body.action === 'continue') {
      // Solo responde si lo último del chat es una nota de traspaso sin contestar.
      const ultimos = await historial(convId, 1);
      if (!ultimos[0]?.adjuntos_json?.traspaso) return json({ ok: true, mensaje: null });
      return json({ ok: true, mensaje: await responder(agent, convId, apiKey) });
    }

    if (body.action === 'review') {
      // Revisión pedida por Luis: el agente revisa desde su especialidad y le escribe en su chat.
      const foco = String(body.foco ?? '').trim().slice(0, 500);
      const pedido = 'Revisión pedida: revisa ahora mis webs desde tu especialidad y dime lo más importante que ves hoy, ' +
        'qué propones (si es un cambio concreto, crea la propuesta) y qué tengo que hacer yo. ' +
        'Empieza con una sola línea en **negrita** que lo resuma en menos de 10 palabras.' +
        (foco ? ` Fíjate sobre todo en esto: ${foco}` : '');
      await admin.from('messages').insert({ conversation_id: convId, rol: 'yo', contenido: pedido });
      const guardado = await responder(agent, convId, apiKey);
      if (guardado) {
        const c = String(guardado.contenido).trim();
        const m = /^\*\*(.+?)\*\*/.exec(c);
        const titulo = (m ? m[1] : c.split('\n')[0]).replaceAll('**', '').trim().slice(0, 90);
        const resto = (m ? c.slice(m[0].length) : c).replaceAll('**', '').replace(/\s+/g, ' ').trim().slice(0, 300);
        await admin.from('avisos').insert({
          agent_id: agent,
          site_id: null,
          titulo: `Revisión de ${NOMBRE[agent]}: ${titulo}`.slice(0, 120),
          texto: resto || titulo,
          enlace: `/agentes?a=${agent}`,
        });
      }
      return json({ ok: true, mensaje: guardado });
    }

    const texto = String(body.texto ?? '').trim().slice(0, 4000);
    if (!texto) return json({ ok: false, error: 'Mensaje vacío.' }, 400);
    await admin.from('messages').insert({ conversation_id: convId, rol: 'yo', contenido: texto });
    return json({ ok: true, mensaje: await responder(agent, convId, apiKey) });
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: mensajeError(e) });
  }
});
