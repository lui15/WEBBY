import { Component, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { Delta } from '../core/format';

/** Una fila del embudo: icono en cuadrado suave, dato, explicación y variación. */
@Component({
  selector: 'app-funnel-row',
  imports: [IonIcon],
  template: `
    <div class="row">
      <span class="ico" [style.background]="'var(' + softVar() + ')'" [style.color]="'var(' + colorVar() + ')'">
        <ion-icon [name]="icon()" aria-hidden="true" />
      </span>
      <div class="txt">
        <p class="main">{{ value() }}</p>
        <p class="sub">{{ hint() }}</p>
      </div>
      <span class="delta" [class]="'delta ' + delta().dir" [attr.aria-label]="delta().aria">
        {{ delta().text }}
      </span>
    </div>
  `,
  styles: `
    .row { display: flex; align-items: center; gap: 12px; padding: 10px 0; }
    .ico { flex: none; width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; font-size: 20px; }
    .txt { flex: 1; min-width: 0; }
    .main { margin: 0; font-weight: 700; font-size: 14px; }
    .sub { margin: 2px 0 0; font-size: 12px; color: var(--muted); line-height: 1.4; }
    .delta { flex: none; font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; }
    .delta.up { color: var(--up); }
    .delta.down { color: var(--down); }
    .delta.flat { color: var(--muted); }
  `,
})
export class FunnelRow {
  readonly icon = input.required<string>();
  readonly value = input.required<string>();
  readonly hint = input.required<string>();
  readonly delta = input.required<Delta>();
  readonly colorVar = input('--mudanzas');
  readonly softVar = input('--soft-blue');
}
