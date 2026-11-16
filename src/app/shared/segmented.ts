import { Component, input, model } from '@angular/core';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

/** Control segmentado (Hoy · 7 días · 30 días…, Pendientes · Aprobadas…). */
@Component({
  selector: 'app-segmented',
  template: `
    <div class="seg" role="tablist" [attr.aria-label]="label()">
      @for (o of options(); track o.value) {
        <button
          type="button"
          role="tab"
          [class.on]="o.value === value()"
          [attr.aria-selected]="o.value === value()"
          (click)="value.set(o.value)"
        >
          {{ o.label }}
          @if (o.count) {
            <span class="count">{{ o.count }}</span>
          }
        </button>
      }
    </div>
  `,
  styles: `
    .seg {
      display: flex; gap: 4px; padding: 4px; border-radius: var(--radius-chip);
      background: var(--track);
    }
    button {
      flex: 1; min-height: 44px; border: 0; border-radius: 14px; background: transparent;
      font-size: 13px; font-weight: 600; color: var(--muted); cursor: pointer;
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    }
    button.on { background: var(--card); color: var(--text); box-shadow: 0 1px 2px rgb(0 0 0 / 0.08); }
    .count {
      min-width: 20px; height: 20px; padding: 0 6px; border-radius: 10px;
      background: var(--badge); color: #fff; font-size: 11px; line-height: 20px;
    }
  `,
})
export class Segmented<T extends string> {
  readonly options = input.required<SegmentOption<T>[]>();
  readonly label = input('Elegir');
  readonly value = model.required<T>();
}
