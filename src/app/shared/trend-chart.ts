import { Component, computed, input, signal } from '@angular/core';
import { fmt } from '../core/format';

export interface TrendSeries {
  id: string;
  label: string;
  /** Color CSS de la serie, p. ej. "var(--chart-obralocal)" */
  color: string;
  points: { fecha: string; valor: number }[];
}

/** Redondea el máximo del eje a un número "bonito" (1, 2, 5 × 10^n). */
function niceMax(m: number): number {
  if (m <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(m));
  const r = m / p;
  return (r <= 1 ? 1 : r <= 2 ? 2 : r <= 5 ? 5 : 10) * p;
}

const shortDate = (iso: string) =>
  new Date(iso + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '');

/**
 * Gráfica de líneas para comparar varias series (una por web) en un solo eje.
 * Líneas de 2px, nombre al final de cada línea, leyenda y cruceta con tooltip al pasar el dedo.
 */
@Component({
  selector: 'app-trend-chart',
  template: `
    @if (!dates().length) {
      <p class="empty">{{ emptyText() }}</p>
    } @else {
      <ul class="legend" aria-hidden="true">
        @for (s of series(); track s.id) {
          <li><span class="sw" [style.background]="s.color"></span>{{ s.label }}</li>
        }
      </ul>

      <div class="chart">
        <div class="yaxis" aria-hidden="true">
          @for (t of ticks(); track t.v) {
            <span [style.top.%]="t.y">{{ format()(t.v) }}</span>
          }
        </div>

        <div
          class="plot"
          tabindex="0"
          role="img"
          [attr.aria-label]="summary()"
          (pointermove)="move($event)"
          (pointerdown)="move($event)"
          (pointerleave)="hover.set(null)"
          (keydown)="key($event)"
          (blur)="hover.set(null)"
        >
          @for (t of ticks(); track t.v) {
            <span class="grid" [class.base]="t.v === 0" [style.top.%]="t.y"></span>
          }
          @for (k of [drawKey()]; track k) {
          <svg class="draw" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            @for (s of lines(); track s.id) {
              <polyline [attr.points]="s.d" [style.stroke]="s.color" />
            }
          </svg>
          }

          @if (hover() !== null) {
            @let h = hover()!;
            <span class="cross" [style.left.%]="x(h)"></span>
            @for (s of lines(); track s.id) {
              @let v = s.byIdx[h];
              @if (v !== undefined) {
                <span class="mark" [style.left.%]="x(h)" [style.top.%]="y(v)" [style.background]="s.color"></span>
              }
            }
            <div class="tip" [class.flip]="x(h) > 55" [style.left.%]="x(h)">
              <p class="tip-date">{{ longDate(dates()[h]) }}</p>
              @for (s of lines(); track s.id) {
                <p class="tip-row">
                  <span class="sw" [style.background]="s.color"></span>
                  <span class="tip-l">{{ s.label }}</span>
                  <strong>{{ s.byIdx[h] === undefined ? '—' : format()(s.byIdx[h]!) }}</strong>
                </p>
              }
            </div>
          }
        </div>

        <div class="ends" aria-hidden="true">
          @for (l of endLabels(); track l.id) {
            <span [style.top.%]="l.top"><i class="sw" [style.background]="l.color"></i>{{ l.label }}</span>
          }
        </div>

        <div class="xaxis" aria-hidden="true">
          <span>{{ short(dates()[0]) }}</span>
          <span>{{ short(dates()[mid()]) }}</span>
          <span>{{ short(dates()[dates().length - 1]) }}</span>
        </div>
      </div>

      <table class="sr-only">
        <caption>{{ ariaLabel() }}</caption>
        <thead><tr><th>Web</th><th>Primer día</th><th>Último día</th><th>Total</th></tr></thead>
        <tbody>
          @for (s of series(); track s.id) {
            <tr>
              <th>{{ s.label }}</th>
              <td>{{ s.points[0] ? format()(s.points[0].valor) : '—' }}</td>
              <td>{{ s.points.length ? format()(s.points[s.points.length - 1].valor) : '—' }}</td>
              <td>{{ format()(total(s)) }}</td>
            </tr>
          }
        </tbody>
      </table>
    }
  `,
  styles: `
    :host { display: block; }
    .empty { margin: 0; color: var(--muted); line-height: 1.5; }
    .legend { list-style: none; margin: 0 0 10px; padding: 0; display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 12px; color: var(--muted); }
    .legend li { display: inline-flex; align-items: center; gap: 6px; }
    .sw { display: inline-block; width: 10px; height: 10px; border-radius: 3px; flex: none; }

    .chart {
      display: grid; grid-template-columns: 34px minmax(0, 1fr) 98px; grid-template-rows: 170px auto;
      column-gap: 6px;
    }
    .yaxis, .ends { position: relative; }
    .yaxis span {
      position: absolute; right: 0; transform: translateY(-50%);
      font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap;
    }
    .ends span {
      position: absolute; left: 0; right: 0; transform: translateY(-50%);
      display: flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 600; color: var(--text); letter-spacing: -0.01em;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .ends .sw { width: 8px; height: 8px; border-radius: 50%; }

    .plot { position: relative; touch-action: pan-y; cursor: crosshair; outline: none; border-radius: 4px; }
    .plot:focus-visible { box-shadow: 0 0 0 2px var(--text); }
    .grid { position: absolute; left: 0; right: 0; height: 0; border-top: 1px dashed var(--border); }
    .grid.base { border-top-style: solid; }
    svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
    polyline { fill: none; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; vector-effect: non-scaling-stroke; }

    .cross { position: absolute; top: 0; bottom: 0; width: 0; border-left: 1px solid var(--muted); opacity: 0.6; pointer-events: none; }
    .mark {
      position: absolute; width: 10px; height: 10px; border-radius: 50%; transform: translate(-50%, -50%);
      box-shadow: 0 0 0 2px var(--card); pointer-events: none;
    }
    .tip {
      position: absolute; top: 0; transform: translateX(12px); z-index: 2; pointer-events: none;
      min-width: 150px; padding: 8px 10px; border-radius: 10px; background: var(--card); border: 1px solid var(--border);
      box-shadow: 0 6px 20px rgb(0 0 0 / 0.14); font-size: 12px;
    }
    .tip.flip { transform: translateX(calc(-100% - 12px)); }
    .tip p { margin: 0; }
    .tip-date { color: var(--muted); margin-bottom: 4px !important; }
    .tip-row { display: flex; align-items: center; gap: 6px; padding: 2px 0; }
    .tip-l { flex: 1; color: var(--muted); }
    .tip strong { font-variant-numeric: tabular-nums; }

    .xaxis { grid-column: 2; display: flex; justify-content: space-between; margin-top: 6px; font-size: 11px; color: var(--muted); }
  `,
})
export class TrendChart {
  readonly series = input.required<TrendSeries[]>();
  readonly format = input<(n: number) => string>((n) => fmt(Math.round(n)));
  readonly ariaLabel = input('Evolución');
  readonly emptyText = input('Todavía no hay días suficientes para dibujar la evolución.');

  protected readonly hover = signal<number | null>(null);
  protected readonly short = shortDate;

  protected readonly dates = computed(() => {
    const set = new Set<string>();
    for (const s of this.series()) for (const p of s.points) set.add(p.fecha);
    return [...set].sort();
  });
  protected readonly mid = computed(() => Math.floor((this.dates().length - 1) / 2));

  private readonly max = computed(() =>
    niceMax(Math.max(0, ...this.series().flatMap((s) => s.points.map((p) => p.valor)))),
  );

  protected readonly ticks = computed(() => {
    const m = this.max();
    return [0, m / 2, m].map((v) => ({ v, y: this.y(v) }));
  });

  /** Cambia cuando cambian los datos: vuelve a crear el dibujo para animarlo. */
  protected readonly drawKey = computed(() => this.lines().map((l) => l.d).join('|'));

  protected readonly lines = computed(() => {
    const idx = new Map(this.dates().map((d, i) => [d, i]));
    return this.series().map((s) => {
      const byIdx: (number | undefined)[] = [];
      for (const p of s.points) byIdx[idx.get(p.fecha)!] = p.valor;
      const d = s.points.map((p) => `${this.x(idx.get(p.fecha)!)},${this.y(p.valor)}`).join(' ');
      return { id: s.id, label: s.label, color: s.color, d, byIdx };
    });
  });

  /** Nombre al final de cada línea, separados para que no se pisen. */
  protected readonly endLabels = computed(() => {
    const labels = this.series()
      .filter((s) => s.points.length)
      .map((s) => ({ id: s.id, label: s.label, color: s.color, top: this.y(s.points[s.points.length - 1].valor) }))
      .sort((a, b) => a.top - b.top);
    const GAP = 11;
    for (let i = 1; i < labels.length; i++) {
      if (labels[i].top - labels[i - 1].top < GAP) labels[i].top = labels[i - 1].top + GAP;
    }
    const overflow = (labels.at(-1)?.top ?? 0) - 100;
    if (overflow > 0) labels.forEach((l) => (l.top = Math.max(0, l.top - overflow)));
    return labels;
  });

  protected readonly summary = computed(() => {
    const parts = this.series().map((s) => `${s.label}: ${this.format()(this.total(s))} en total`);
    return `${this.ariaLabel()}. ${parts.join('. ')}. Usa las flechas para ver cada día.`;
  });

  protected x(i: number): number {
    const n = this.dates().length;
    return n <= 1 ? 50 : (i / (n - 1)) * 100;
  }

  protected y(v: number): number {
    return 100 - (v / this.max()) * 100;
  }

  protected total(s: TrendSeries): number {
    return s.points.reduce((n, p) => n + p.valor, 0);
  }

  protected longDate(iso: string): string {
    return new Date(iso + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'long' });
  }

  protected move(e: PointerEvent): void {
    const el = e.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    const n = this.dates().length;
    if (!n || !r.width) return;
    const i = Math.round(((e.clientX - r.left) / r.width) * (n - 1));
    this.hover.set(Math.min(n - 1, Math.max(0, i)));
  }

  protected key(e: KeyboardEvent): void {
    const n = this.dates().length;
    if (!n) return;
    const cur = this.hover() ?? n - 1;
    if (e.key === 'ArrowLeft') this.hover.set(Math.max(0, cur - 1));
    else if (e.key === 'ArrowRight') this.hover.set(Math.min(n - 1, cur + 1));
    else if (e.key === 'Home') this.hover.set(0);
    else if (e.key === 'End') this.hover.set(n - 1);
    else return;
    e.preventDefault();
  }
}
