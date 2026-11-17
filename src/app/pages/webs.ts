import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonIcon } from '@ionic/angular';
import { DataService } from '../core/data.service';
import { delta, fmt, timeAgo } from '../core/format';
import { Period, SiteId } from '../core/models';
import { SupabaseService } from '../core/supabase.service';
import { ChipOption, ChipSelector } from '../shared/chip-selector';
import { PageHeader } from '../shared/page-header';
import { SegmentOption, Segmented } from '../shared/segmented';
import { Skeleton } from '../shared/skeleton';
import { SiteCompare } from '../shared/site-compare';
import { StatCard } from '../shared/stat-card';

const DAYS: Record<Exclude<Period, 'comparar'>, number> = { hoy: 1, '7d': 7, '30d': 30 };

@Component({
  selector: 'app-webs',
  host: { class: 'ion-page' },
  imports: [IonContent, IonIcon, PageHeader, ChipSelector, Segmented, StatCard, Skeleton, SiteCompare],
  template: `
    <ion-content>
      <app-page-header [kicker]="period() === 'comparar' ? 'Las 3 webs, lado a lado' : site().dominio" title="Tus webs" />
      <div class="page" [style.--site]="'var(' + site().colorVar + ')'" [style.--site-soft]="'var(' + site().softVar + ')'">

        @switch (data.google().estado) {
          @case ('sin_conectar') {
            <section class="card connect">
              <h2 class="card-title">Conecta tus datos de Google</h2>
              <p>
                Ahora ves <strong>datos de ejemplo</strong>. Conecta tu cuenta de Google y Webby leerá
                Search Console y Analytics de tus 3 webs. Solo lectura: Webby no puede cambiar nada en Google.
              </p>
              @if (msg()) { <p class="err" role="alert">{{ msg() }}</p> }
              <button type="button" class="btn btn-solid wide" (click)="connect()" [disabled]="busy()">
                {{ busy() ? 'Abriendo Google…' : 'Conectar con Google' }}
              </button>
            </section>
          }
          @case ('conectado') {
            <section class="card status">
              <div class="st-txt">
                <p class="st-main"><span class="dot ok"></span>Conectado con Google</p>
                <p class="small muted">
                  @if (data.syncing()) { Trayendo tus datos… puede tardar un minuto. }
                  @else if (data.google().ultimaSync) { Actualizado {{ ago(data.google().ultimaSync!) }} · se actualiza solo cada mañana }
                  @else { Aún no se han traído datos }
                </p>
              </div>
              <button type="button" class="btn" (click)="refresh()" [disabled]="data.syncing()" aria-label="Actualizar datos de Google">
                <ion-icon name="refresh-outline" aria-hidden="true" [class.spin]="data.syncing()" />
                Actualizar
              </button>
              @if (msg()) { <p class="err full" role="alert">{{ msg() }}</p> }
              @if (data.google().error) {
                <p class="warn full">{{ data.google().error }}</p>
              }
              <button type="button" class="btn full" (click)="connect()" [disabled]="busy()">
                {{ busy() ? 'Abriendo Google…' : 'Volver a conectar con Google' }}
              </button>
            </section>
          }
        }

        @if (period() !== 'comparar') {
          <app-chip-selector label="Elegir web" [options]="siteOptions" [(value)]="siteId" />
        }
        <app-segmented label="Periodo" [options]="periods" [(value)]="period" />

        @if (data.loading()) {
          <div class="grid-2"><app-skeleton [rows]="5" /><app-skeleton [rows]="4" /></div>
        } @else if (period() === 'comparar') {
          <app-site-compare />

          <section class="card">
            <div class="card-head">
              <h2 class="card-title">Todo de un vistazo</h2>
              <span class="small muted">últimos 7 días</span>
            </div>
            <div class="table-wrap">
              <table class="side">
                <thead>
                  <tr>
                    <th scope="col"><span class="sr-only">Dato</span></th>
                    @for (s of data.sites; track s.id) {
                      <th scope="col"><span class="dot" [style.background]="'var(' + s.colorVar + ')'"></span>{{ s.nombre }}</th>
                    }
                  </tr>
                </thead>
                <tbody>
                  @for (r of sideRows(); track r.label) {
                    <tr>
                      <th scope="row">{{ r.label }}<span>{{ r.hint }}</span></th>
                      @for (c of r.cells; track $index) {
                        <td [class.best]="c.best">{{ c.text }}</td>
                      }
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <p class="small muted tnote">En negrita, la web que mejor va en cada fila. {{ delayText() }}</p>
          </section>
        } @else {
          <div class="grid-2">
            <section class="card">
              <div class="card-head">
                <h2 class="card-title">Personas en tu web hoy</h2>
                @if (data.liveNow(siteId()) !== null) {
                  <span class="pill live"><span class="dot"></span>{{ data.liveNow(siteId()) }} ahora mismo</span>
                }
              </div>
              @if (data.todayTotal(siteId()) !== null) {
                <p class="num today">{{ data.todayTotal(siteId()) }}</p>
                <div class="bars" role="img" [attr.aria-label]="'Visitas por horas hoy. Total: ' + data.todayTotal(siteId())">
                  @for (h of data.hourly(siteId()); track h.hora) {
                    <span class="b" [class.now]="h.hora === hour" [class.past]="h.hora < hour"
                          [style.height.%]="h.hora > hour ? 6 : 6 + (h.personas / maxHour()) * 94"></span>
                  }
                </div>
                <div class="axis small muted"><span>0 h</span><span>12 h</span><span>23 h</span></div>
              } @else if (data.todayError()) {
                <p class="muted">{{ data.todayError() }}</p>
              } @else {
                <p class="muted">Mirando quién está en tu web…</p>
              }
            </section>

            <div class="right">
              <div class="minis">
                <app-stat-card label="Te vieron en Google" [value]="fmt(p().vieron)" [delta]="delta(p().vieron, p().vieronPrev)" />
                <app-stat-card label="Entraron desde Google" [value]="fmt(p().entraron)" [delta]="delta(p().entraron, p().entraronPrev)" />
                <app-stat-card label="Pidieron precio" [value]="fmt(p().contactaron)" [delta]="delta(p().contactaron, p().contactaronPrev)" />
              </div>
              <section class="card explain">
                <h2 class="card-title">¿Qué significa?</h2>
                @if (p().vieron === 0 && !data.demo()) {
                  <p>Todavía no hay datos de Google para este periodo. Pulsa «Actualizar» o vuelve mañana.</p>
                } @else {
                  <p>
                    De cada 100 personas que te vieron en Google, unas {{ pct(p().entraron, p().vieron) }} entraron,
                    y de cada 100 que entraron, {{ pct(p().contactaron, p().entraron) }} te pidieron presupuesto.
                  </p>
                  <p class="small">Cuentan como petición: formularios enviados y clics en llamar o en WhatsApp.</p>
                }
              </section>
            </div>

            <section class="card span-2">
              <div class="card-head">
                <h2 class="card-title">¿Qué buscaron para encontrarte?</h2>
              </div>
              @let qs = data.queries(siteId(), days());
              @if (qs === null) {
                <p class="muted">Cargando búsquedas…</p>
              } @else if (!qs.length) {
                <p class="muted">Aún no hay búsquedas guardadas para este periodo.</p>
              } @else {
                <div class="qhead small muted" aria-hidden="true">
                  <span>Búsqueda</span><span>Te vieron</span><span>Entraron</span><span>Puesto</span>
                </div>
                <ul class="queries">
                  @for (q of qs; track q.consulta) {
                    <li>
                      <span class="q">
                        <strong>{{ q.consulta }}</strong>
                        @if (q.solicitudes) {
                          <span class="req">{{ q.solicitudes }} {{ q.solicitudes === 1 ? 'solicitud' : 'solicitudes' }}</span>
                        }
                      </span>
                      <span><span class="sr-only">Te vieron </span>{{ fmt(q.vieron) }}</span>
                      <span><span class="sr-only">Entraron </span>{{ q.entraron }}</span>
                      <span><span class="sr-only">Puesto </span>{{ q.puesto }}.º</span>
                    </li>
                  }
                </ul>
              }
              <p class="small muted">{{ delayText() }}</p>
            </section>

            <section class="card span-2">
              <div class="card-head">
                <h2 class="card-title">Tu ficha de Google Maps</h2>
              </div>
              @let g = data.gbp();
              @let f = g?.fichas?.[siteId()];
              @if (!g || !f) {
                <p class="muted">Aún no hay datos de la ficha de esta web.</p>
              } @else {
                <p class="small muted">{{ f.nombre }} · {{ g.periodo }}</p>
                <div class="gbp">
                  <div><p class="num">{{ f.vistas }}</p><p class="small muted">vieron tu ficha<br>{{ f.busqueda }} en Google · {{ f.maps }} en Maps</p></div>
                  <div><p class="num">{{ f.llamadas }}</p><p class="small muted">te llamaron<br>desde la ficha</p></div>
                  <div><p class="num">{{ f.web }}</p><p class="small muted">entraron a<br>tu web</p></div>
                  <div><p class="num">{{ f.como_llegar }}</p><p class="small muted">pidieron<br>cómo llegar</p></div>
                </div>
                <p class="small muted">Actualizado {{ ago(g.actualizado) }}. Google da estos datos con unos días de retraso.</p>
              }
            </section>
          </div>
        }
      </div>
    </ion-content>
  `,
  styles: `
    .connect p { margin: 8px 0 0; line-height: 1.5; }
    .connect .btn { margin-top: 14px; }
    .wide { width: 100%; }
    .status { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
    .st-txt { flex: 1; min-width: 0; }
    .st-txt p { margin: 0; }
    .st-main { display: flex; align-items: center; gap: 8px; font-weight: 700; }
    .dot.ok { background: var(--live); }
    .full { flex-basis: 100%; }
    .err { margin: 8px 0 0; color: var(--down); font-size: 13px; line-height: 1.45; }
    .warn { margin: 0; padding: 10px 12px; border-radius: 12px; background: var(--soft-orange); font-size: 13px; line-height: 1.45; white-space: pre-line; }
    .spin { animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .live .dot { background: var(--live); }
    .today { margin: 0 0 12px; font-size: 40px; line-height: 1; }
    .bars { display: flex; align-items: flex-end; gap: 3px; height: 110px; }
    .b { flex: 1; border-radius: 3px 3px 0 0; background: var(--track); min-height: 4px; }
    .b.past { background: color-mix(in srgb, var(--site) 35%, var(--card)); }
    .b.now { background: var(--site); }
    .axis { display: flex; justify-content: space-between; margin-top: 6px; }
    .right { display: flex; flex-direction: column; gap: var(--gap); }
    .minis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
    .explain { background: var(--site-soft); border-color: transparent; }
    .explain p { margin: 6px 0 0; line-height: 1.5; }
    .qhead, .queries li { display: grid; grid-template-columns: minmax(0, 1fr) 64px 60px 52px; gap: 8px; align-items: center; }
    .qhead span:not(:first-child), .queries li > span:not(:first-child) { text-align: right; font-variant-numeric: tabular-nums; }
    .queries { list-style: none; margin: 6px 0 8px; padding: 0; }
    .queries li { padding: 10px 0; border-top: 1px solid var(--border); }
    .q { display: flex; flex-direction: column; gap: 4px; min-width: 0; overflow-wrap: anywhere; }
    .req { align-self: flex-start; font-size: 11px; font-weight: 700; color: var(--up); background: var(--soft-green); padding: 2px 8px; border-radius: 10px; }
    .gbp { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 12px 0; }
    @media (min-width: 720px) { .gbp { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
    .gbp .num { margin: 0; font-size: 28px; line-height: 1.1; }
    .gbp p.small { margin: 4px 0 0; line-height: 1.35; }
    .table-wrap { overflow-x: auto; margin: 0 -4px; }
    .side { width: 100%; border-collapse: collapse; font-size: 13px; }
    .side th, .side td { padding: 10px 6px; border-top: 1px solid var(--border); text-align: right; font-variant-numeric: tabular-nums; }
    .side thead th { border-top: 0; font-size: 12px; font-weight: 600; color: var(--muted); white-space: nowrap; vertical-align: bottom; }
    .side thead .dot { margin-right: 5px; vertical-align: 1px; }
    .side tbody th { text-align: left; font-weight: 600; }
    .side tbody th span { display: block; font-size: 11px; font-weight: 400; color: var(--muted); margin-top: 2px; }
    .side td { color: var(--muted); }
    .side td.best { color: var(--text); font-weight: 700; }
    .tnote { margin: 8px 0 0; }
  `,
})
export class WebsPage {
  protected readonly data = inject(DataService);
  private readonly sb = inject(SupabaseService);
  private readonly router = inject(Router);

  /** ?google=ok|error|cancelado al volver de Google */
  readonly google = input<string | undefined>();
  /** ?web=obralocal para abrir directamente una web (desde Inicio o la comparación) */
  readonly web = input<string | undefined>();

  protected readonly siteId = signal<SiteId>('obralocal');
  protected readonly period = signal<Period>('7d');
  protected readonly site = computed(() => this.data.site(this.siteId()));
  protected readonly days = computed(() => {
    const p = this.period();
    return p === 'comparar' ? 7 : DAYS[p];
  });
  protected readonly p = computed(() => this.data.funnel(this.siteId(), this.days()));
  protected readonly hour = new Date().getHours();
  protected readonly busy = signal(false);
  protected readonly msg = signal<string | null>(null);
  protected readonly fmt = fmt;
  protected readonly delta = delta;
  protected readonly ago = timeAgo;

  protected readonly siteOptions: ChipOption<SiteId>[] = this.data.sites.map((s) => ({
    value: s.id, label: s.nombre, dotVar: s.colorVar,
  }));
  protected readonly periods: SegmentOption<Period>[] = [
    { value: 'hoy', label: '1 día' },
    { value: '7d', label: '7 días' },
    { value: '30d', label: '30 días' },
    { value: 'comparar', label: 'Comparar' },
  ];

  /** Tabla "Todo de un vistazo": cada fila compara las 3 webs y marca la mejor. */
  protected readonly sideRows = computed(() => {
    const sites = this.data.sites;
    const f = sites.map((s) => this.data.funnel(s.id, 7));
    const gbp = this.data.gbp()?.fichas;
    const row = (label: string, hint: string, vals: (number | null)[], text: (n: number) => string, higherIsBetter = true) => {
      const nums = vals.filter((v): v is number => v !== null);
      const best = nums.length ? (higherIsBetter ? Math.max(...nums) : Math.min(...nums)) : null;
      return {
        label, hint,
        cells: vals.map((v) => ({ text: v === null ? '—' : text(v), best: v !== null && v === best && best !== 0 })),
      };
    };
    const n = (v: number) => fmt(Math.round(v));
    const rows = [
      row('Te vieron', 'veces en Google', f.map((x) => x.vieron), n),
      row('Entraron', 'desde Google', f.map((x) => x.entraron), n),
      row('De 100, entran', 'que te ven en Google', f.map((x) => (x.vieron ? Math.round((x.entraron / x.vieron) * 1000) / 10 : null)),
        (v) => `${v.toLocaleString('es-ES')} %`),
      row('Pidieron precio', 'formulario, WhatsApp, llamada', f.map((x) => x.contactaron), n),
      row('Crecen', 'entraron vs. semana anterior', f.map((x) => (x.entraronPrev ? delta(x.entraron, x.entraronPrev).pct : null)),
        (v) => `${v > 0 ? '+' : ''}${v} %`),
    ];
    if (gbp) {
      rows.push(
        row('Ficha de Maps', 'vistas, 28 días', sites.map((s) => gbp[s.id]?.vistas ?? null), n),
        row('Llamadas', 'desde la ficha, 28 días', sites.map((s) => gbp[s.id]?.llamadas ?? null), n),
      );
    }
    return rows;
  });

  protected readonly maxHour = computed(() => Math.max(1, ...this.data.hourly(this.siteId()).map((h) => h.personas)));

  protected readonly delayText = computed(() => {
    if (this.data.demo()) return 'Datos de ejemplo. Conecta Google para ver los tuyos.';
    const d = this.data.datosHasta();
    if (!d) return 'Los datos de Google llegan con unos 2 días de retraso.';
    const day = new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
    return `Datos de Google hasta el ${day} (Google tarda unos 2 días en darlos).`;
  });

  constructor() {
    // Cargar lo que haga falta cuando cambian la web, el periodo o la conexión.
    effect(() => {
      const site = this.siteId();
      const days = this.days();
      if (this.data.demo() || this.data.loading()) return;
      untracked(() => {
        void this.data.loadFunnel(days);
        void this.data.loadQueries(site, days);
      });
    });
    effect(() => {
      const site = this.siteId();
      if (this.data.demo() || this.data.loading()) return;
      untracked(() => void this.data.loadToday(site));
    });
    // Abrir una web concreta (?web=...) o la comparación (?web=comparar)
    effect(() => {
      const w = this.web();
      if (!w) return;
      untracked(() => {
        if (w === 'comparar') this.period.set('comparar');
        else if (this.data.sites.some((s) => s.id === w)) {
          this.siteId.set(w as SiteId);
          if (this.period() === 'comparar') this.period.set('7d');
        }
      });
    });
    // Vuelta desde Google
    effect(() => {
      const g = this.google();
      if (!g) return;
      untracked(() => void this.afterGoogle(g));
    });
  }

  private async afterGoogle(g: string): Promise<void> {
    this.router.navigate([], { queryParams: { google: null }, replaceUrl: true });
    if (g === 'cancelado') {
      this.msg.set('Cancelaste el permiso en Google. Puedes volver a intentarlo cuando quieras.');
      return;
    }
    if (g !== 'ok') {
      this.msg.set('Google no completó la conexión. Revisa que la clave secreta esté guardada en Supabase y vuelve a probar.');
      return;
    }
    await this.sb.initialized;
    await this.data.loadGoogleStatus();
    this.msg.set(await this.data.syncNow(90));
  }

  protected async connect(): Promise<void> {
    this.busy.set(true);
    this.msg.set(await this.data.connectGoogle());
    this.busy.set(false);
  }

  protected async refresh(): Promise<void> {
    this.msg.set(null);
    const first = !this.data.google().ultimaSync;
    this.msg.set(await this.data.syncNow(first ? 90 : 5));
    void this.data.loadToday(this.siteId());
  }

  protected pct(a: number, b: number): string {
    return b ? String(Math.round((a / b) * 100)) : '0';
  }
}
