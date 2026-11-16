import { Component, input } from '@angular/core';
import { Delta } from '../core/format';

/** Mini tarjeta: etiqueta, número grande y variación. */
@Component({
  selector: 'app-stat-card',
  template: `
    <div class="card stat">
      <p class="lbl">{{ label() }}</p>
      <p class="num big">{{ value() }}</p>
      <p class="d" [class]="'d ' + delta().dir" [attr.aria-label]="delta().aria">{{ delta().text }}</p>
    </div>
  `,
  styles: `
    .stat { padding: 14px 12px; height: 100%; }
    .lbl { margin: 0; font-size: 12px; color: var(--muted); line-height: 1.3; min-height: 2.6em; }
    .big { margin: 6px 0 2px; font-size: 24px; }
    .d { margin: 0; font-size: 12px; font-weight: 700; }
    .d.up { color: var(--up); }
    .d.down { color: var(--down); }
    .d.flat { color: var(--muted); }
  `,
})
export class StatCard {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly delta = input.required<Delta>();
}
