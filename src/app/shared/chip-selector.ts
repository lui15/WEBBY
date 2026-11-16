import { Component, input, model } from '@angular/core';

export interface ChipOption<T extends string> {
  value: T;
  label: string;
  /** Variable CSS para el punto de color, p. ej. "--obralocal" */
  dotVar?: string;
}

/** Chips de selección única (webs, periodos…). */
@Component({
  selector: 'app-chip-selector',
  template: `
    <div class="chips" role="radiogroup" [attr.aria-label]="label()">
      @for (o of options(); track o.value) {
        <button
          type="button"
          role="radio"
          class="chip"
          [class.on]="o.value === value()"
          [attr.aria-checked]="o.value === value()"
          (click)="value.set(o.value)"
        >
          @if (o.dotVar) {
            <span class="dot" [style.background]="'var(' + o.dotVar + ')'"></span>
          }
          {{ o.label }}
        </button>
      }
    </div>
  `,
  styles: `
    .chips {
      display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none;
      margin: 0 calc(var(--gutter) * -1); padding: 4px var(--gutter);
    }
    .chips::-webkit-scrollbar { display: none; }
    .chip {
      flex: none; display: inline-flex; align-items: center; gap: 8px;
      height: 44px; padding: 0 16px; border-radius: var(--radius-chip);
      border: 1px solid var(--border); background: var(--card);
      font-size: 14px; font-weight: 600; cursor: pointer; white-space: nowrap;
    }
    .chip.on { background: var(--sel-bg); color: var(--sel-text); border-color: var(--sel-bg); }
  `,
})
export class ChipSelector<T extends string> {
  readonly options = input.required<ChipOption<T>[]>();
  readonly label = input('Elegir');
  readonly value = model.required<T>();
}
