// Conexión con Google (OAuth 2.0) hecha 100 % en el servidor.
//  POST  (con la sesión de Webby)  -> devuelve la URL de Google para dar permiso.
//  GET   (Google vuelve aquí)       -> cambia el código por el refresh token,
//                                      lo guarda cifrado en Vault y vuelve a Webby.
import { createClient } from 'npm:@supabase/supabase-js@2';

const CLIENT_ID = '397144334108-gau6mnvdbg6pk8e49qq72elcg1st6f5o.apps.googleusercontent.com';
const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/webmasters.readonly',
  'https://www.googleapis.com/auth/analytics.readonly',
];
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
// Google vuelve a tu propio dominio; Vercel lo reenvía a esta función (public/vercel.json).
const REDIRECT_URI = 'https://webby.armamuebles.es/auth/google';
const STATE_TTL_MS = 15 * 60_000;

const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  db: { schema: 'webby' },
  auth: { persistSession: false },
});

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const text = (msg: string, status = 400) =>
  new Response(msg, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

function allowedReturn(u: unknown): u is string {
  if (typeof u !== 'string') return false;
  try {
    const x = new URL(u);
    return x.protocol === 'https:' || x.hostname === 'localhost' || x.protocol === 'capacitor:';
  } catch {
    return false;
  }
}

async function start(req: Request): Promise<Response> {
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: { user } } = await admin.auth.getUser(jwt);
  if (!user) return json({ error: 'Tienes que entrar en Webby primero.' }, 401);

  const { data: owner } = await admin.from('owners').select('user_id').eq('user_id', user.id).maybeSingle();
  if (!owner) return json({ error: 'Esta cuenta no puede usar Webby.' }, 403);

  const { returnTo } = await req.json().catch(() => ({}));
  if (!allowedReturn(returnTo)) return json({ error: 'Dirección de vuelta no válida.' }, 400);

  if (!Deno.env.get('GOOGLE_CLIENT_SECRET')) {
    return json({ error: 'Falta la clave secreta de Google en Supabase (GOOGLE_CLIENT_SECRET).' }, 500);
  }

  const state = crypto.randomUUID() + crypto.randomUUID();
  await admin.from('oauth_states').delete().lt('created_at', new Date(Date.now() - STATE_TTL_MS).toISOString());
  const { error } = await admin.from('oauth_states').insert({ state, user_id: user.id, return_to: returnTo });
  if (error) return json({ error: 'No se pudo iniciar la conexión.' }, 500);

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  }).toString();
  return json({ url: url.toString() });
}

async function callback(url: URL): Promise<Response> {
  const state = url.searchParams.get('state');
  if (!state) return text('Falta información de Google. Vuelve a Webby e inténtalo otra vez.');

  const { data: st } = await admin.from('oauth_states').select('*').eq('state', state).maybeSingle();
  if (!st || Date.now() - new Date(st.created_at).getTime() > STATE_TTL_MS) {
    return text('Este enlace ha caducado. Vuelve a Webby y pulsa otra vez «Conectar con Google».');
  }
  await admin.from('oauth_states').delete().eq('state', state);

  const back = new URL(st.return_to);
  const code = url.searchParams.get('code');
  if (url.searchParams.get('error') || !code) {
    back.searchParams.set('google', 'cancelado');
    return Response.redirect(back.toString(), 302);
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '',
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });
  const tok = await res.json();
  if (!res.ok || !tok.refresh_token) {
    console.error('Google token error:', tok.error, tok.error_description);
    back.searchParams.set('google', 'error');
    return Response.redirect(back.toString(), 302);
  }

  const { error } = await admin.rpc('set_google_token', {
    p_token: tok.refresh_token,
    p_scopes: String(tok.scope ?? '').split(' ').filter(Boolean),
  });
  back.searchParams.set('google', error ? 'error' : 'ok');
  if (error) console.error('Vault error:', error.message);
  return Response.redirect(back.toString(), 302);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    if (req.method === 'POST') return await start(req);
    if (req.method === 'GET') return await callback(new URL(req.url));
    return text('Método no permitido', 405);
  } catch (e) {
    console.error(e);
    return json({ error: 'Algo ha fallado al conectar con Google.' }, 500);
  }
});
