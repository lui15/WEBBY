# Webby

Panel personal para vigilar y hacer crecer ObraLocal Madrid, Mudanzas360 y ArmaMuebles.
Angular 20 (standalone + signals) · Ionic 9 · Capacitor 8 (Android/iOS) · Supabase.

## Backend

- Proyecto Supabase **tramo**, esquema propio **webby** (no toca `public`). SQL en `supabase/migrations/`.
- Solo el admin de tramo (tabla `webby.owners`) ve los datos (RLS).
- Edge Functions: `google-oauth` (conexión con Google en el servidor) y `sync-google` (Search Console + GA4).
- El refresh token de Google se guarda en Supabase Vault. pg_cron sincroniza cada día a las 05:30 UTC.
- Secretos necesarios: `GOOGLE_CLIENT_SECRET`. El esquema `webby` debe estar en *Exposed schemas* (Data API).

## Arrancar

```bash
npm install
npm start            # http://localhost:4200
npm run cap:sync     # compila y copia a android/
npx cap open android # abre Android Studio
```

## Estructura

- `src/styles.css`: sistema de diseño (variables de color claro/oscuro, tarjetas, botones).
- `src/app/core/`: modelos, servicio de datos (hoy datos de ejemplo), tema y formato en español.
- `src/app/shared/`: componentes reutilizables (agent-avatar, chip-selector, funnel-row,
  stat-card, proposal-card, theme-toggle, segmented, page-header, skeleton).
- `src/app/pages/`: Inicio, Webs, Agentes, Propuestas e Informes.

## Fases

1. [x] App, diseño, navegación y 5 pantallas con datos de ejemplo
2. [~] Supabase: tablas, RLS, OAuth de Google, Search Console y GA4
3. [ ] Eventos de conversión de GA4 en las 3 webs (por PR)
4. [ ] Agentes con IA (empezando por Lupa)
5. [ ] Propuestas, notificaciones push y Pull Requests en GitHub
6. [ ] Informe semanal de los lunes
7. [ ] Google Business Profile, Radar y Central de Solicitudes
