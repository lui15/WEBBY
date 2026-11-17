import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DailyPoint, DataService } from '../core/data.service';
import { delta, fmt } from '../core/format';
import { FunnelData, SiteId } from '../core/models';
import { CountUp } from './count-up';
import { SegmentOption, Segmented } from './segmented';
import { TrendChart, TrendSeries } from './trend-chart';

type Metric = 'vieron' | 'entraron' | 'contactaron' | 'ratio';
type Days = '7' | '30';

interface MetricDef {
  label: string;
  /** Frase para "X va en cabeza con N …" */
  unidad: string;
  /** Explicación sencilla de lo que se compara */
  ayuda: string;
  daily: (d: DailyPoint) => number | null;
  value: (f: FunnelData) => [number, number];
  format: (n: number) => string;
}

const ratio = (a: number, b: number) => (b ? (a / b) * 100 : 0);
const pctFmt = (n: number) => `${n.toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`;

const METRICS: Record<Metric, MetricDef> = {
  vieron: {
    label: 'Te vieron', unidad: 'veces en Google',
    ayuda: 'Cuántas veces salió cada web en Google cuando alguien buscó algo.',
    daily: (d) => d.impresiones, value: (f) => [f.vieron, f.vieronPrev], format: (n) => fmt(Math.round(n)),
  },
  entraron: {
    label: 'Entraron', unidad: 'personas desde Google',
    ayuda: 'Cuántas personas te vieron en Google y entraron a la web.',
    daily: (d) => d.clics, value: (f) => [f.entraron, f.entraronPrev], format: (n) => fmt(Math.round(n)),
  },
  contactaron: {
    label: 'Pidieron precio', unidad: 'solicitudes',
    ayuda: 'Formularios, WhatsApp y llamadas que contaron en cada web.',
    daily: (d) => d.conversiones, value: (f) => [f.contactaron, f.contactaronPrev], format: (n) => fmt(Math.round(n)),
  },
  ratio: {
    label: 'De 100, entran', unidad: 'de cada 100 que la ven',
    ayuda: 'De cada 100 personas que ven la web en Google, cuántas entran. Sirve para comparar webs de distinto tamaño.',
    daily: (d) => (d.impresiones ? ratio(d.clics ?? 0, d.impresiones) : null),
    value: (f) => [ratio(f.entraron, f.vieron), ratio(f.entraronPrev, f.vieronPrev)], format: pctFmt,
  },
};

/** Compara las 3 webs: barras por web, quién va en cabeza y evolución diaria. */
@Component({
  selector: 'app-site-compare',
  imports: [Segmented, TrendChart, RouterLink, CountUp],
  template: `
    <section class="card cmp">
      <div class="card-head">
        <h2 class="card-title">{{ title() }}</h2>
        <div class="days" role="radiogroup" aria-label="Periodo">
          @for (d of dayOpts; track d.value) {
            <button type="button" role="radio" [class.on]="days() === d.value" [attr.aria-checked]="days() === d.value"
                    (click)="days.set(d.value)">{{ d.label }}</button>
          }
        </div>
      </div>

      <app-segmented label="Qué comparar" [options]="metricOpts" [(value)]="metric" />
      <p class="ayuda small muted">{{ def().ayuda }}</p>

      <ul class="bars">
        @for (r of rows(); track r.id) {
          <li>
            <a class="row" [routerLink]="['/webs']" [queryParams]="{ web: r.id }"
               [attr.aria-label]="r.nombre + ': ' + def().format(r.value) + ', ' + r.d.aria + '. Ver detalle'">
              <span class="name"><span class="dot" [style.background]="r.color"></span>{{ r.nombre }}</span>
              <span class="val num"><app-count [value]="r.value" [format]="def().format" /></span>
              <span class="track" aria-hidden="true">
                <span class="fill" [style.width.%]="r.width" [style.background]="r.color"></span>
              </span>
              <span class="d" [class]="'d ' + r.d.dir">{{ r.d.text }}</span>
            </a>
          </li>
        }
      </ul>

      <p class="verdict">{{ verdict() }}</p>

      @if (showTrend()) {
        <div class="trend">
          <p class="label">Día a día · últimos {{ trendDays() }} días</p>
          <app-trend-chart [series]="series()" [format]="def().format"
                           [ariaLabel]="def().label + ' día a día de tus 3 webs'" />
        </div>
      }
      <p class="small muted foot">{{ note() }}</p>
    </section>
  `,
  styles: `
    .cmp { display: flex; flex-direction: column; gap: 10px; }
    .cmp .card-head { margin-bottom: 0; }
    .days { display: flex; gap: 4px; padding: 3px; border-radius: 12px; background: var(--track); }
    .days button {
      min-width: 44px; min-height: 36px; padding: 0 10px; border: 0; border-radius: 9px; background: none;
      font-size: 12px; font-weight: 600; color: var(--muted); cursor: pointer;
    }
    .days button.on { background: var(--card); color: var(--text); box-shadow: 0 1px 2px rgb(0 0 0 / 0.08); }
    .ayuda { margin: 0; line-height: 1.45; }

    .bars { list-style: none; margin: 4px 0 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
    .row {
      display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: 'name val' 'track d';
      column-gap: 12px; row-gap: 6px; align-items: center; padding: 8px 6px; margin: 0 -6px;
      border-radius: 12px; color: inherit; text-decoration: none; min-height: 44px;
    }
    .row:hover { background: var(--track); }
    .name { grid-area: name; display: inline-flex; align-items: center; gap: 8px; font-weight: 600; }
    .val { grid-area: val; font-size: 18px; text-align: right; }
    .track { grid-area: track; height: 10px; border-radius: 5px; background: var(--track); overflow: hidden; }
    .fill { display: block; height: 100%; border-radius: 0 4px 4px 0; min-width: 4px; transition: width 0.4s ease; }
    .d { grid-area: d; font-size: 12px; font-weight: 700; text-align: right; min-width: 56px; }
    .d.up { color: var(--up); }
    .d.down { color: var(--down); }
    .d.flat { color: var(--muted); }

    .verdict {
      margin: 2px 0 0; padding: 10px 12px; border-radius: 12px; background: var(--track);
      font-size: 13px; line-height: 1.5;
    }
    .trend { margin-top: 6px; }
    .trend .label { margin: 0 0 8px; }
    .foot { margin: 0; }
    @media (prefers-reduced-motion: reduce) { .fill { transition: none; } }
  `,
})
export class SiteCompare {
  protected readonly data = inject(DataService);

  readonly title = input('Compara tus 3 webs');
  readonly showTrend = input(true);

  protected readonly metric = signal<Metric>('entraron');
  protected readonly days = signal<Days>('7');
  protected readonly def = computed(() => METRICS[this.metric()]);
  protected readonly trendDays = computed(() => (this.days() === '7' ? 28 : 60));

  protected readonly metricOpts: SegmentOption<Metric>[] = [
    { value: 'vieron', label: 'Te vieron' },
    { value: 'entraron', label: 'Entraron' },
    { value: 'contactaron', label: 'Precio' },
    { value: 'ratio', label: 'De 100' },
  ];
  protected readonly dayOpts: { value: Days; label: string }[] = [
    { value: '7', label: '7 días' },
    { value: '30', label: '30 días' },
  ];

  constructor() {
    effect(() => {
      const d = Number(this.days());
      if (this.data.loading()) return;
      untracked(() => {
        void this.data.loadFunnel(d);
        void this.data.loadDaily(60);
      });
    });
  }

  protected readonly rows = computed(() => {
    const def = this.def();
    const d = Number(this.days());
    const rows = this.data.sites.map((s) => {
      const [value, prev] = def.value(this.data.funnel(s.id, d));
      return {
        id: s.id as SiteId,
        nombre: s.nombre,
        color: `var(${s.colorVar.replace('--', '--chart-')})`,
        value,
        prev,
        d: delta(Math.round(value * 10), Math.round(prev * 10)),
      };
    });
    const max = Math.max(...rows.map((r) => r.value), 0);
    return rows.map((r) => ({ ...r, width: max ? (r.value / max) * 100 : 0 }));
  });

  protected readonly verdict = computed(() => {
    const rows = this.rows();
    const def = this.def();
    if (rows.every((r) => r.value === 0)) {
      return this.metric() === 'contactaron'
        ? 'Todavía no hay solicitudes contadas en este periodo. En cuanto tus webs registren formularios, WhatsApp o llamadas, aparecerán aquí.'
        : 'Todavía no hay datos de Google para este periodo. Pulsa «Actualizar» o vuelve mañana.';
    }
    const lead = [...rows].sort((a, b) => b.value - a.value)[0];
    const withPrev = rows.filter((r) => r.prev > 0);
    const grows = [...withPrev].sort((a, b) => b.d.pct - a.d.pct);
    let s = `${lead.nombre} va en cabeza con ${def.format(lead.value)} ${def.unidad}.`;
    if (grows.length) {
      const best = grows[0];
      const worst = grows.at(-1)!;
      if (best.d.pct > 0) s += ` La que más crece es ${best.nombre} (${best.d.text.replace('▲ ', '+')}).`;
      if (worst.d.pct < 0 && worst.id !== best.id) {
        s += ` ${worst.nombre} baja (${worst.d.text.replace('▼ ', '−')}): conviene mirarla.`;
      }
    }
    return s;
  });

  protected readonly series = computed<TrendSeries[]>(() => {
    const all = this.data.daily() ?? [];
    const def = this.def();
    const desde = new Date(Date.now() - this.trendDays() * 86_400_000).toISOString().slice(0, 10);
    return this.data.sites.map((s) => ({
      id: s.id,
      label: s.nombre,
      color: `var(${s.colorVar.replace('--', '--chart-')})`,
      points: all
        .filter((p) => p.siteId === s.id && p.fecha >= desde)
        .map((p) => ({ fecha: p.fecha, valor: def.daily(p) }))
        .filter((p): p is { fecha: string; valor: number } => p.valor !== null),
    }));
  });

  protected readonly note = computed(() =>
    this.data.demo()
      ? 'Datos de ejemplo: conecta Google en la pestaña Webs para ver los tuyos.'
      : this.metric() === 'contactaron'
        ? 'Solicitudes según Google Analytics (llegan con 1 día de retraso).'
        : 'Datos de Google, que llegan con unos 2 días de retraso. Toca una web para ver su detalle.',
  );
}
