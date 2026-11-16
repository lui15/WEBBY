// Desarrollo → GitHub.
//  { action: "lanzar", id }  -> lanza el flujo "Webby · propuesta aprobada" en el repositorio de esa web
//                               (repository_dispatch). Claude hace el cambio en una rama y abre un PR.
//  { action: "estado" }      -> mira en GitHub cómo van las propuestas en marcha (PR abierto, fusionado…).
// Solo el dueño de Webby. El token de GitHub va en el secreto GITHUB_TOKEN de Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2';

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

async function isOwner(req: Request): Promise<boolean> {
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: { user } } = await admin.auth.getUser(jwt);
  if (!user) return false;
  const { data } = await admin.from('owners').select('user_id').eq('user_id', user.id).maybeSingle();
  return !!data;
}

async function gh(path: string, init: RequestInit = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${Deno.env.get('GITHUB_TOKEN')}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'webby',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, data: text ? JSON.parse(text) : null };
}

const ramaDe = (id: string) => `webby/${id.slice(0, 8)}`;

async function lanzar(id: string) {
  const { data: p } = await admin.from('proposals')
    .select('id, site_id, titulo, que, porque, archivos_json, estado').eq('id', id).maybeSingle();
  if (!p) return json({ ok: false, error: 'No encuentro esa propuesta.' });
  if (!['aprobada', 'en_progreso'].includes(p.estado)) return json({ ok: false, error: 'Primero tienes que aprobarla.' });
  const { data: site } = await admin.from('sites').select('repo_github').eq('id', p.site_id).maybeSingle();
  if (!site?.repo_github) return json({ ok: false, error: 'Esta web no tiene repositorio de GitHub configurado.' });

  const rama = ramaDe(p.id);
  const r = await gh(`/repos/${site.repo_github}/dispatches`, {
    method: 'POST',
    body: JSON.stringify({
      event_type: 'webby-propuesta',
      client_payload: {
        id: p.id,
        rama,
        titulo: String(p.titulo).slice(0, 200),
        que: String(p.que).slice(0, 4000),
        porque: String(p.porque).slice(0, 2000),
        archivos: ((p.archivos_json ?? []) as { ruta: string }[]).map((a) => a.ruta).slice(0, 20),
      },
    }),
  });
  if (!r.ok) {
    console.error('GitHub dispatch', r.status, r.data);
    const msg = r.status === 401 ? 'El token de GitHub no es válido o ha caducado.'
      : r.status === 404 || r.status === 403 ? 'El token de GitHub no tiene permiso sobre ese repositorio.'
      : 'GitHub no aceptó la petición.';
    return json({ ok: false, error: msg });
  }
  await admin.from('proposals').update({ estado: 'en_progreso', rama }).eq('id', p.id);
  return json({ ok: true, rama });
}

async function estado() {
  const { data: props } = await admin.from('proposals')
    .select('id, site_id, rama, estado').in('estado', ['en_progreso', 'pr_abierto']);
  if (!props?.length) return json({ ok: true, cambios: 0 });
  const { data: sites } = await admin.from('sites').select('id, repo_github');
  const repo = new Map((sites ?? []).map((s) => [s.id, s.repo_github]));
  let cambios = 0;
  for (const p of props) {
    const rp = repo.get(p.site_id);
    if (!rp || !p.rama) continue;
    const owner = rp.split('/')[0];
    const r = await gh(`/repos/${rp}/pulls?state=all&head=${owner}:${encodeURIComponent(p.rama)}`);
    const pr = r.ok ? (r.data as { html_url: string; merged_at: string | null; state: string }[])[0] : null;
    if (!pr) continue;
    const nuevo = pr.merged_at ? 'fusionada' : pr.state === 'open' ? 'pr_abierto' : p.estado;
    await admin.from('proposals').update({ estado: nuevo, pr_url: pr.html_url }).eq('id', p.id);
    if (nuevo !== p.estado) cambios++;
  }
  return json({ ok: true, cambios });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    if (!(await isOwner(req))) return json({ ok: false, error: 'No tienes permiso.' }, 401);
    if (!Deno.env.get('GITHUB_TOKEN')) {
      return json({ ok: false, error: 'Falta el token de GitHub (GITHUB_TOKEN) en los secretos de Supabase.' });
    }
    const body = await req.json().catch(() => ({}));
    if (body.action === 'lanzar') return await lanzar(String(body.id ?? ''));
    return await estado();
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: 'Algo ha fallado al hablar con GitHub.' });
  }
});
