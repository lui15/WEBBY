// Sincroniza Search Console y Google Analytics 4 con Supabase.
//  action "sync"  { days }  -> guarda métricas diarias y búsquedas (cron diario o botón Actualizar).
//  action "today" { site }  -> personas ahora mismo (tiempo real) y visitas por horas de hoy.
// Autorización: sesión del dueño de Webby, o cabecera x-webby-cron (pg_cron).
import { createClient } from 'npm:@supabase/supabase-js@2';

const CLIENT_ID = '397144334108-gau6mnvdbg6pk8e49qq72elcg1st6f5o.apps.googleusercontent.com';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;

const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
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

class PlainError extends Error {}

/** Eventos que las tres webs envían cuando alguien pide presupuesto, llama o escribe por WhatsApp. */
const EVENTOS_SOLICITUD = ['generate_lead', 'click_telefono', 'click_whatsapp'];

interface Site {
  id: string;
  nombre: string;
  dominio: string;
  gsc_property: string | null;
  ga4_property_id: string | null;
}

// ---------------------------------------------------------------- auth
async function authorized(req: Request): Promise<boolean> {
  const cron = req.headers.get('x-webby-cron');
  if (cron) {
    const { data } = await admin.rpc('check_cron_secret', { p: cron });
    return data === true;
  }
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: { user } } = await admin.auth.getUser(jwt);
  if (!user) return false;
  const { data } = await admin.from('owners').select('user_id').eq('user_id', user.id).maybeSingle();
  return !!data;
}

// ---------------------------------------------------------------- Google
async function accessToken(): Promise<string> {
  const { data: refresh } = await admin.rpc('get_google_token');
  if (!refresh) throw new PlainError('Todavía no has conectado Webby con Google.');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '',
      refresh_token: refresh as string,
      grant_type: 'refresh_token',
    }),
  });
  const tok = await res.json();
  if (!res.ok) {
    if (tok.error === 'invalid_grant') {
      throw new PlainError('Google ha retirado el permiso. Vuelve a pulsar «Conectar con Google».');
    }
    throw new PlainError('Google no responde ahora mismo. Se intentará de nuevo más tarde.');
  }
  return tok.access_token;
}

async function g<T>(token: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message ?? res.statusText;
    console.error('Google API', res.status, url, msg);
    if (res.status === 403 && /has not been used|is disabled/i.test(msg)) {
      throw new PlainError('Falta activar una API en Google Cloud: ' + (url.includes('webmasters') ? 'Search Console API' : url.includes('analyticsadmin') ? 'Google Analytics Admin API' : 'Google Analytics Data API') + '.');
    }
    if (res.status === 403 && /insufficient authentication scopes/i.test(msg)) {
      throw new PlainError('Google no dio permiso para leer ' + (url.includes('webmasters') ? 'Search Console' : 'Analytics') + '. Vuelve a pulsar «Conectar con Google» y marca todas las casillas.');
    }
    if (res.status === 403) throw new PlainError('Tu cuenta de Google no tiene acceso a esta web en ' + (url.includes('webmasters') ? 'Search Console.' : 'Analytics.'));
    throw new PlainError('Google devolvió un error: ' + msg);
  }
  return data as T;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => iso(new Date(Date.now() - n * 86_400_000));
const gaDate = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;

async function upsertChunks(table: string, rows: Record<string, unknown>[], onConflict: string) {
  for (let i = 0; i < rows.length; i += 1000) {
    const { error } = await admin.from(table).upsert(rows.slice(i, i + 1000), { onConflict });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

// ---------------------------------------------------------------- GA4: encontrar las propiedades
async function discoverGa4(token: string, sites: Site[]) {
  const missing = sites.filter((s) => !s.ga4_property_id);
  if (!missing.length) return;
  type Summaries = { accountSummaries?: { propertySummaries?: { property: string }[] }[] };
  const sum = await g<Summaries>(token, 'https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200');
  const props = (sum.accountSummaries ?? []).flatMap((a) => a.propertySummaries ?? []).map((p) => p.property);
  for (const prop of props) {
    type Streams = { dataStreams?: { webStreamData?: { defaultUri?: string } }[] };
    const st = await g<Streams>(token, `https://analyticsadmin.googleapis.com/v1beta/${prop}/dataStreams`);
    for (const s of st.dataStreams ?? []) {
      const uri = s.webStreamData?.defaultUri;
      if (!uri) continue;
      let host = '';
      try { host = new URL(uri).hostname.replace(/^www\./, ''); } catch { continue; }
      const site = missing.find((m) => host === m.dominio || host.endsWith('.' + m.dominio));
      if (site && !site.ga4_property_id) {
        site.ga4_property_id = prop.replace('properties/', '');
        await admin.from('sites').update({ ga4_property_id: site.ga4_property_id }).eq('id', site.id);
      }
    }
  }
}

// ---------------------------------------------------------------- sync
async function syncSite(token: string, site: Site, days: number): Promise<string[]> {
  const problems: string[] = [];
  const start = daysAgo(days + 3);
  const end = daysAgo(1);

  if (site.gsc_property) {
    try {
      const base = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site.gsc_property)}/searchAnalytics/query`;
      type GscRows = { rows?: { keys: string[]; clicks: number; impressions: number; position: number }[] };
      const daily = await g<GscRows>(token, base, { startDate: start, endDate: end, dimensions: ['date'], dataState: 'all', rowLimit: 1000 });
      await upsertChunks('metrics_daily', (daily.rows ?? []).map((r) => ({
        site_id: site.id, fecha: r.keys[0], impresiones: r.impressions, clics: r.clicks,
        posicion_media: Math.round(r.position * 100) / 100, updated_at: new Date().toISOString(),
      })), 'site_id,fecha');

      const rows: Record<string, unknown>[] = [];
      for (let startRow = 0; startRow < 100_000; startRow += 25_000) {
        const q = await g<GscRows>(token, base, {
          startDate: start, endDate: end, dimensions: ['date', 'query'], dataState: 'all', rowLimit: 25_000, startRow,
        });
        for (const r of q.rows ?? []) {
          rows.push({ site_id: site.id, fecha: r.keys[0], consulta: r.keys[1], impresiones: r.impressions, clics: r.clicks, posicion: Math.round(r.position * 100) / 100 });
        }
        if ((q.rows ?? []).length < 25_000) break;
      }
      await upsertChunks('search_queries', rows, 'site_id,fecha,consulta');
    } catch (e) {
      problems.push(`${site.nombre} (Search Console): ${e instanceof PlainError ? e.message : 'error inesperado'}`);
      if (!(e instanceof PlainError)) console.error(e);
    }
  }

  if (site.ga4_property_id) {
    try {
      type Report = { rows?: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[] };
      const rep = await g<Report>(token, `https://analyticsdata.googleapis.com/v1beta/properties/${site.ga4_property_id}:runReport`, {
        dateRanges: [{ startDate: start, endDate: 'yesterday' }],
        dimensions: [{ name: 'date' }],
        metrics: [{ name: 'activeUsers' }, { name: 'sessions' }, { name: 'keyEvents' }],
        limit: 1000,
      });
      // Solicitudes = formularios enviados + clics en llamar + clics en WhatsApp, estén o no
      // marcados como evento clave en Analytics (así cuentan también los de antes de marcarlos).
      const leads = await g<Report>(token, `https://analyticsdata.googleapis.com/v1beta/properties/${site.ga4_property_id}:runReport`, {
        dateRanges: [{ startDate: start, endDate: 'yesterday' }],
        dimensions: [{ name: 'date' }],
        metrics: [{ name: 'eventCount' }],
        dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: { values: EVENTOS_SOLICITUD } } },
        limit: 1000,
      });
      const porDia = new Map((leads.rows ?? []).map((r) => [r.dimensionValues[0].value, Number(r.metricValues[0].value)]));
      await upsertChunks('metrics_daily', (rep.rows ?? []).map((r) => ({
        site_id: site.id, fecha: gaDate(r.dimensionValues[0].value),
        usuarios: Number(r.metricValues[0].value), sesiones: Number(r.metricValues[1].value),
        conversiones: Math.max(porDia.get(r.dimensionValues[0].value) ?? 0, Math.round(Number(r.metricValues[2].value))),
        updated_at: new Date().toISOString(),
      })), 'site_id,fecha');

      // Qué eventos llegan (llamadas, WhatsApp, formularios…) y si cuentan como evento clave.
      const ev = await g<Report>(token, `https://analyticsdata.googleapis.com/v1beta/properties/${site.ga4_property_id}:runReport`, {
        dateRanges: [{ startDate: '28daysAgo', endDate: 'yesterday' }],
        dimensions: [{ name: 'eventName' }],
        metrics: [{ name: 'eventCount' }, { name: 'keyEvents' }],
        limit: 100,
      });
      await admin.from('snapshots').upsert({
        clave: `ga_eventos_${site.id}`,
        descripcion: `Eventos de Google Analytics de ${site.nombre} en los últimos 28 días (veces, y cuántas cuentan como evento clave/solicitud)`,
        datos: Object.fromEntries((ev.rows ?? []).map((r) => [
          r.dimensionValues[0].value, { veces: Number(r.metricValues[0].value), clave: Number(r.metricValues[1].value) },
        ])),
        actualizado: new Date().toISOString(),
      });
    } catch (e) {
      problems.push(`${site.nombre} (Analytics): ${e instanceof PlainError ? e.message : 'error inesperado'}`);
      if (!(e instanceof PlainError)) console.error(e);
    }
  } else {
    problems.push(`${site.nombre}: no encontré su propiedad de Google Analytics con esta cuenta de Google.`);
  }
  return problems;
}

async function sync(days: number) {
  try {
    const token = await accessToken();
    const { data: sites } = await admin.from('sites').select('id,nombre,dominio,gsc_property,ga4_property_id');
    const list = (sites ?? []) as Site[];
    try {
      await discoverGa4(token, list);
    } catch (e) {
      if (!(e instanceof PlainError)) throw e;
      await admin.from('integrations').update({ last_error: e.message }).eq('proveedor', 'google');
    }
    const problems = (await Promise.all(list.map((s) => syncSite(token, s, days)))).flat();
    await admin.from('integrations').update({
      last_sync_at: new Date().toISOString(),
      last_error: problems.length ? problems.join('\n') : null,
    }).eq('proveedor', 'google');
    return json({ ok: true, problemas: problems });
  } catch (e) {
    const msg = e instanceof PlainError ? e.message : 'Algo ha fallado al traer tus datos de Google.';
    if (!(e instanceof PlainError)) console.error(e);
    await admin.from('integrations').update({ last_error: msg }).eq('proveedor', 'google');
    return json({ ok: false, error: msg }, 200);
  }
}

// ---------------------------------------------------------------- hoy (tiempo real)
async function today(siteId: string) {
  try {
    const { data: site } = await admin.from('sites').select('ga4_property_id').eq('id', siteId).maybeSingle();
    if (!site?.ga4_property_id) return json({ ok: false, error: 'Esta web aún no está unida a Google Analytics.' });
    const token = await accessToken();
    const base = `https://analyticsdata.googleapis.com/v1beta/properties/${site.ga4_property_id}`;
    type Report = { rows?: { dimensionValues?: { value: string }[]; metricValues: { value: string }[] }[] };
    const [rt, hours, total] = await Promise.all([
      g<Report>(token, `${base}:runRealtimeReport`, { metrics: [{ name: 'activeUsers' }] }),
      g<Report>(token, `${base}:runReport`, {
        dateRanges: [{ startDate: 'today', endDate: 'today' }],
        dimensions: [{ name: 'hour' }], metrics: [{ name: 'activeUsers' }],
      }),
      g<Report>(token, `${base}:runReport`, {
        dateRanges: [{ startDate: 'today', endDate: 'today' }], metrics: [{ name: 'activeUsers' }],
      }),
    ]);
    const hourly = Array.from({ length: 24 }, (_, hora) => ({ hora, personas: 0 }));
    for (const r of hours.rows ?? []) hourly[Number(r.dimensionValues![0].value)].personas = Number(r.metricValues[0].value);
    return json({
      ok: true,
      ahora: Number(rt.rows?.[0]?.metricValues[0].value ?? 0),
      hoy: Number(total.rows?.[0]?.metricValues[0].value ?? 0),
      horas: hourly,
    });
  } catch (e) {
    return json({ ok: false, error: e instanceof PlainError ? e.message : 'No pude leer el tiempo real de Analytics.' });
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
  if (!(await authorized(req))) return json({ error: 'No autorizado' }, 401);
  const body = await req.json().catch(() => ({}));
  if (body.action === 'today') return today(String(body.site ?? ''));
  const days = Math.min(480, Math.max(1, Number(body.days) || 5));
  return sync(days);
});
