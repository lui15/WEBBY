// Avisos de Webby: notificaciones al móvil y revisión diaria de los agentes.
//  Con la sesión del dueño:
//   { action: "clave" }              -> clave pública para suscribir este navegador a las notificaciones
//   { action: "suscribir", sub }     -> guarda la suscripción de este navegador
//   { action: "quitar", endpoint }   -> la borra
//   { action: "probar" }             -> manda una notificación de prueba
//   { action: "diario" }             -> lanza ahora la revisión de los agentes
//  Con la cabecera x-webby-cron (pg_cron, cada mañana después de traer los datos de Google):
//   { action: "diario" }             -> revisión de los agentes + informe semanal los lunes + aviso al móvil
import Anthropic from 'npm:@anthropic-ai/sdk@1.9.0';
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const MODEL = 'claude-opus-5-5';
const APP_URL = 'https://webby.armamuebles.es';
const AGENTES = ['seo', 'marketing', 'anuncios', 'competencia', 'desarrollo'] as const;
const WEBS = ['armamuebles', 'obralocal', 'mudanzas'] as const;

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  db: { schema: 'webby' },
  auth: { persistSession: false },
});

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webby-cron',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// ---------------------------------------------------------------- auth
async function quien(req: Request): Promise<'cron' | 'owner' | null> {
  const cron = req.headers.get('x-webby-cron');
  if (cron) {
    const { data } = await admin.rpc('check_cron_secret', { p: cron });
    return data === true ? 'cron' : null;
  }
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: { user } } = await admin.auth.getUser(jwt);
  if (!user) return null;
  const { data } = await admin.from('owners').select('user_id').eq('user_id', user.id).maybeSingle();
  return data ? 'owner' : null;
}

// ---------------------------------------------------------------- notificaciones web
async function vapid(): Promise<{ publicKey: string; privateKey: string }> {
  const { data } = await admin.rpc('get_vapid');
  if (data) return JSON.parse(data as string);
  const keys = webpush.generateVAPIDKeys();
  await admin.rpc('set_vapid', { p: JSON.stringify(keys) });
  const { data: again } = await admin.rpc('get_vapid'); // por si otra petición la creó a la vez
  return JSON.parse(again as string);
}

async function enviarPush(titulo: string, texto: string, url = '/inicio'): Promise<{ enviados: number; fallos: number }> {
  const keys = await vapid();
  webpush.setVapidDetails(APP_URL, keys.publicKey, keys.privateKey);
  const { data: subs } = await admin.from('push_tokens').select('token').eq('plataforma', 'web');
  let enviados = 0, fallos = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(JSON.parse(s.token), JSON.stringify({ title: titulo, body: texto, url }), { TTL: 86_400 });
      enviados++;
    } catch (e) {
      fallos++;
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await admin.from('push_tokens').delete().eq('token', s.token);
      else await admin.from('push_tokens').update({ ultimo_error: String((e as Error).message).slice(0, 300) }).eq('token', s.token);
    }
  }
  return { enviados, fallos };
}

// ---------------------------------------------------------------- datos para los agentes
const fmt = (n: number) => Math.round(n).toLocaleString('es-ES');

async function resumenDatos() {
  const hoy = new Date();
  const dia = (n: number) => new Date(hoy.getTime() - n * 864e5).toISOString().slice(0, 10);
  const [{ data: sites }, { data: m }, { data: snaps }, { data: props }, { data: avisos }] = await Promise.all([
    admin.from('sites').select('id, nombre, dominio').order('id'),
    admin.from('metrics_daily').select('site_id, fecha, impresiones, clics, posicion_media, sesiones, conversiones').gte('fecha', dia(35)),
    admin.from('snapshots').select('clave, datos, actualizado'),
    admin.from('proposals').select('agent_id, site_id, titulo, estado').order('created_at', { ascending: false }).limit(20),
    admin.from('avisos').select('agent_id, site_id, titulo, created_at').order('created_at', { ascending: false }).limit(20),
  ]);
  const rows = m ?? [];
  const suma = (site: string, k: string, desde: string, hasta: string) =>
    rows.filter((r) => r.site_id === site && r.fecha >= desde && r.fecha < hasta)
      .reduce((n, r) => n + (Number((r as Record<string, unknown>)[k]) || 0), 0);
  const filas = (sites ?? []).map((s) => ({
    siteId: s.id,
    nombre: s.nombre,
    vieron7: suma(s.id, 'impresiones', dia(9), dia(2)), vieronPrev7: suma(s.id, 'impresiones', dia(16), dia(9)),
    clics7: suma(s.id, 'clics', dia(9), dia(2)), clicsPrev7: suma(s.id, 'clics', dia(16), dia(9)),
    entraron: suma(s.id, 'sesiones', dia(7), dia(0)), entraronPrev: suma(s.id, 'sesiones', dia(14), dia(7)),
    solicitudes: suma(s.id, 'conversiones', dia(7), dia(0)), solicitudesPrev: suma(s.id, 'conversiones', dia(14), dia(7)),
    ayer: rows.find((r) => r.site_id === s.id && r.fecha === dia(1)) ?? null,
  }));
  const queries: string[] = [];
  for (const s of sites ?? []) {
    const { data: q } = await admin.rpc('top_queries', { p_site: s.id, p_days: 28, p_limit: 10 });
    if (q?.length) queries.push(`${s.nombre}: ` + (q as { consulta: string; vieron: number; entraron: number; puesto: number }[])
      .map((x) => `«${x.consulta}» ${x.vieron} vistas/${x.entraron} clics/puesto ${x.puesto}`).join('; '));
  }
  const texto = [
    `Hoy es ${hoy.toISOString().slice(0, 10)}.`,
    'Últimos 7 días (Search Console va 2 días retrasado; visitas y solicitudes de Analytics hasta ayer). Solicitudes = formularios enviados + clics en llamar + clics en WhatsApp.',
    ...filas.map((f) => `- ${f.nombre}: vieron en Google ${fmt(f.vieron7)} (antes ${fmt(f.vieronPrev7)}), clics ${f.clics7} (antes ${f.clicsPrev7}), visitas ${f.entraron} (antes ${f.entraronPrev}), solicitudes ${f.solicitudes} (antes ${f.solicitudesPrev}).`),
    'Búsquedas principales (28 días):', ...queries,
    ...(snaps ?? []).map((s) => `${s.clave} (actualizado ${String(s.actualizado).slice(0, 10)}): ${JSON.stringify(s.datos)}`),
    'Propuestas ya hechas (no las repitas): ' + (props ?? []).map((p) => `[${p.estado}] ${p.titulo} (${p.site_id}, ${p.agent_id})`).join('; '),
    'Avisos recientes (no los repitas salvo que haya un cambio nuevo): ' + (avisos ?? []).map((a) => `${String(a.created_at).slice(0, 10)} ${a.titulo}`).join('; '),
  ].join('\n');
  return { texto, filas };
}

// ---------------------------------------------------------------- revisión diaria
const SISTEMA = `Eres el equipo de agentes de Webby, el panel de Luis, dueño de tres negocios de servicios en Madrid:
ArmaMuebles (armamuebles, montaje de muebles), ObraLocal (obralocal, reformas) y Mudanzas360 (mudanzas, mudanzas y portes).
Agentes: seo (Google y Maps), marketing (contenido, reseñas y confianza), anuncios (Google Ads; Luis aún no tiene campañas),
competencia (quién le supera en Google) y desarrollo (código, velocidad y medición de las webs).
Luis no es técnico: escribe en español de España, de tú, frases cortas, sin jerga. Usa solo los datos que te dan; nunca inventes cifras.
Las webs son nuevas y tienen pocos datos: no saques conclusiones de cambios de 1 o 2 visitas.`;

const ESQUEMA_DIARIO = {
  type: 'object',
  properties: {
    avisos: {
      type: 'array',
      description: 'De 0 a 4 avisos útiles de hoy. Cada uno lo firma el agente al que le corresponde. Mejor 0 que avisos de relleno.',
      items: {
        type: 'object',
        properties: {
          agente: { type: 'string', enum: [...AGENTES] },
          web: { type: 'string', enum: [...WEBS, 'todas'] },
          titulo: { type: 'string', description: 'Máximo 70 caracteres' },
          texto: { type: 'string', description: '1 a 3 frases: qué ha pasado y qué hacer' },
        },
        required: ['agente', 'web', 'titulo', 'texto'],
        additionalProperties: false,
      },
    },
    propuestas: {
      type: 'array',
      description: 'Como mucho 1 propuesta nueva, concreta y de bajo riesgo para cambiar una web; lista vacía si no hay ninguna clara.',
      items: {
      type: 'object',
      properties: {
        agente: { type: 'string', enum: [...AGENTES] },
        web: { type: 'string', enum: [...WEBS] },
        titulo: { type: 'string' },
        que: { type: 'string' },
        porque: { type: 'string' },
      },
      required: ['agente', 'web', 'titulo', 'que', 'porque'],
      additionalProperties: false,
      },
    },
    notificacion: { type: 'string', description: 'Resumen para el móvil, una línea, máximo 110 caracteres, con lo más importante del día y cifras.' },
  },
  required: ['avisos', 'propuestas', 'notificacion'],
  additionalProperties: false,
};

const ESQUEMA_SEMANAL = {
  type: 'object',
  properties: {
    resumen: { type: 'string', description: '2 o 3 frases con lo más importante de la semana' },
    equipo: {
      type: 'array',
      items: {
        type: 'object',
        properties: { agente: { type: 'string', enum: [...AGENTES] }, texto: { type: 'string', description: 'Una frase de ese agente' } },
        required: ['agente', 'texto'],
        additionalProperties: false,
      },
    },
    recomendaciones: { type: 'array', items: { type: 'string' }, description: '3 tareas concretas para esta semana' },
  },
  required: ['resumen', 'equipo', 'recomendaciones'],
  additionalProperties: false,
};

async function preguntar<T>(client: Anthropic, instruccion: string, datos: string, schema: object): Promise<T> {
  const res = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 8000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
    system: [{ type: 'text', text: SISTEMA, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: `${instruccion}\n\nDATOS:\n${datos}` }],
  } as never);
  if (res.stop_reason === 'refusal') throw new Error('Claude no quiso responder');
  const txt = res.content.filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('');
  return JSON.parse(txt) as T;
}

async function diario() {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json({ ok: false, error: 'Falta la clave de Claude en Supabase.' });
  const client = new Anthropic({ apiKey });
  const { texto, filas } = await resumenDatos();

  type Diario = {
    avisos: { agente: string; web: string; titulo: string; texto: string }[];
    propuestas: { agente: string; web: string; titulo: string; que: string; porque: string }[];
    notificacion: string;
  };
  const r = await preguntar<Diario>(client,
    'Revisa los datos de esta mañana y prepara los avisos del día para Luis, la propuesta si la hay y el texto de la notificación al móvil.',
    texto, ESQUEMA_DIARIO);

  if (r.avisos.length) {
    await admin.from('avisos').insert(r.avisos.slice(0, 4).map((a) => ({
      agent_id: a.agente, site_id: a.web === 'todas' ? null : a.web,
      titulo: a.titulo.slice(0, 120), texto: a.texto, enlace: `/agentes?a=${a.agente}`,
    })));
  }
  const propuesta = r.propuestas[0];
  if (propuesta) {
    await admin.from('proposals').insert({
      agent_id: propuesta.agente, site_id: propuesta.web,
      titulo: propuesta.titulo.slice(0, 200), que: propuesta.que, porque: propuesta.porque,
    });
  }

  // Los lunes, informe de la semana pasada.
  let informe = false;
  const hoy = new Date();
  const lunes = new Date(hoy); lunes.setUTCDate(hoy.getUTCDate() - ((hoy.getUTCDay() + 6) % 7));
  const semanaInicio = new Date(lunes.getTime() - 7 * 864e5).toISOString().slice(0, 10);
  const semanaFin = new Date(lunes.getTime() - 864e5).toISOString().slice(0, 10);
  const { data: yaHay } = await admin.from('weekly_reports').select('id').eq('semana_inicio', semanaInicio).maybeSingle();
  if (!yaHay && hoy.getUTCDay() === 1) {
    type Semanal = { resumen: string; equipo: { agente: string; texto: string }[]; recomendaciones: string[] };
    const s = await preguntar<Semanal>(client, `Escribe el informe de la semana del ${semanaInicio} al ${semanaFin}.`, texto, ESQUEMA_SEMANAL);
    await admin.from('weekly_reports').insert({
      semana_inicio: semanaInicio,
      resumen: s.resumen,
      contenido_json: {
        semanaFin,
        filas: filas.map((f) => ({ siteId: f.siteId, entraron: f.entraron, solicitudes: f.solicitudes, solicitudesPrev: f.solicitudesPrev })),
        equipo: s.equipo.map((e) => ({ agentId: e.agente, texto: e.texto })),
        recomendaciones: s.recomendaciones,
      },
    });
    informe = true;
  }

  const extra = [r.avisos.length ? `${r.avisos.length} aviso${r.avisos.length > 1 ? 's' : ''}` : '', propuesta ? '1 propuesta' : '', informe ? 'informe semanal' : '']
    .filter(Boolean).join(' · ');
  const push = await enviarPush('Webby · tu resumen de hoy', r.notificacion + (extra ? ` (${extra})` : ''), informe ? '/informes' : '/inicio');
  return json({ ok: true, avisos: r.avisos.length, propuesta: !!propuesta, informe, push });
}

// ---------------------------------------------------------------- handler
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const rol = await quien(req);
    if (!rol) return json({ ok: false, error: 'No tienes permiso.' }, 401);
    const body = await req.json().catch(() => ({}));

    if (body.action === 'diario') return await diario();
    if (rol !== 'owner') return json({ ok: false, error: 'Acción no permitida.' }, 403);

    if (body.action === 'clave') return json({ ok: true, publicKey: (await vapid()).publicKey });
    if (body.action === 'suscribir') {
      if (!body.sub?.endpoint) return json({ ok: false, error: 'Suscripción no válida.' }, 400);
      await admin.from('push_tokens').upsert({ token: JSON.stringify(body.sub), plataforma: 'web', ultimo_error: null });
      return json({ ok: true });
    }
    if (body.action === 'quitar') {
      const { data } = await admin.from('push_tokens').select('token').eq('plataforma', 'web');
      for (const t of data ?? []) if (JSON.parse(t.token).endpoint === body.endpoint) await admin.from('push_tokens').delete().eq('token', t.token);
      return json({ ok: true });
    }
    if (body.action === 'probar') {
      const r = await enviarPush('Webby', '¡Listo! Así te llegarán los avisos de tu equipo cada mañana.', '/inicio');
      return json({ ok: r.enviados > 0, ...r, error: r.enviados ? undefined : 'No hay ningún móvil suscrito todavía.' });
    }
    return json({ ok: false, error: 'Acción desconocida.' }, 400);
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: 'Algo ha fallado en los avisos de Webby.' });
  }
});
