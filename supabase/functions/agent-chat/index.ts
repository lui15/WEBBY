// Chat con los agentes de Webby (Claude).
//  { action: "history", agent }          -> mensajes guardados de ese agente
//  { action: "send", agent, texto }      -> guarda tu mensaje, pregunta a Claude y guarda la respuesta
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
Escribe en texto plano: sin tablas ni encabezados Markdown; puedes usar guiones para listas y **negrita** con moderación.`;

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

async function contexto(): Promise<string> {
  const hoy = new Date();
  const desde = new Date(hoy.getTime() - 56 * 864e5).toISOString().slice(0, 10);
  const corte = new Date(hoy.getTime() - 28 * 864e5).toISOString().slice(0, 10);

  const [{ data: sites }, { data: metrics }, { data: props }, { data: integ }, { data: snaps }] = await Promise.all([
    admin.from('sites').select('id, nombre, dominio').order('id'),
    admin.from('metrics_daily').select('site_id, fecha, impresiones, clics, posicion_media, usuarios, sesiones, conversiones').gte('fecha', desde),
    admin.from('proposals').select('agent_id, site_id, titulo, estado, created_at').order('created_at', { ascending: false }).limit(15),
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
    lineas.push('Propuestas recientes: ' + props.map((p) => `[${p.estado}] ${p.titulo} (${p.site_id}, de ${p.agent_id})`).join('; ') + '.');
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

async function historial(convId: string, limit = 40) {
  const { data } = await admin.from('messages').select('id, rol, contenido, adjuntos_json, created_at')
    .eq('conversation_id', convId).order('created_at', { ascending: false }).limit(limit);
  return (data ?? []).reverse();
}

// ---------------------------------------------------------------- handler
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    if (!(await ownerId(req))) return json({ ok: false, error: 'No tienes permiso.' }, 401);
    const body = await req.json().catch(() => ({}));
    const agent = body.agent as AgentId;
    if (!(agent in PERSONA)) return json({ ok: false, error: 'Agente desconocido.' }, 400);

    const convId = await conversacion(agent);

    if (body.action === 'history') return json({ ok: true, mensajes: await historial(convId) });

    if (body.action === 'reset') {
      const { data } = await admin.from('conversations').insert({ agent_id: agent }).select('id').single();
      return json({ ok: true, conversacion: data?.id });
    }

    const texto = String(body.texto ?? '').trim().slice(0, 4000);
    if (!texto) return json({ ok: false, error: 'Mensaje vacío.' }, 400);

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return json({ ok: false, error: 'Falta la clave de Claude (ANTHROPIC_API_KEY) en los secretos de Supabase.' });
    }

    const previos = await historial(convId, 30);
    await admin.from('messages').insert({ conversation_id: convId, rol: 'yo', contenido: texto });

    const propuestas: { id: string; titulo: string }[] = [];
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
        return 'Propuesta guardada en Webby › Propuestas. Luis la verá allí para aprobarla.';
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
        { type: 'text', text: `Datos actuales de Webby:\n${await contexto()}` },
      ],
      tools: [
        crearPropuesta,
        { type: 'web_search_20260209', name: 'web_search', max_uses: 4, user_location: { type: 'approximate', city: 'Madrid', country: 'ES', timezone: 'Europe/Madrid' } },
        { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 4 },
      ],
      messages: [
        ...previos.map((m) => ({ role: m.rol === 'yo' ? 'user' as const : 'assistant' as const, content: m.contenido })),
        { role: 'user' as const, content: texto },
      ],
    } as never).runUntilDone();

    let respuesta = final.content
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('')
      .trim();
    if (final.stop_reason === 'refusal') respuesta = 'No puedo ayudarte con eso. Prueba a preguntarlo de otra forma.';
    if (!respuesta) respuesta = 'No he podido terminar la respuesta. ¿Lo intentas otra vez?';

    const adjuntos = propuestas.length ? { propuestas } : null;
    const { data: guardado } = await admin.from('messages')
      .insert({ conversation_id: convId, rol: 'agente', contenido: respuesta, adjuntos_json: adjuntos })
      .select('id, rol, contenido, adjuntos_json, created_at').single();

    return json({ ok: true, mensaje: guardado });
  } catch (e) {
    console.error(e);
    const msg = e instanceof Anthropic.AuthenticationError
      ? 'La clave de Claude no es válida.'
      : e instanceof Anthropic.RateLimitError
        ? 'Claude está saturado ahora mismo; prueba en un minuto.'
        : e instanceof Anthropic.APIError && /credit|billing/i.test(e.message)
          ? 'Tu cuenta de Claude no tiene saldo. Añade crédito en console.anthropic.com.'
          : 'No he podido responder. Inténtalo otra vez en un momento.';
    return json({ ok: false, error: msg });
  }
});
