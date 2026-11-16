import { Component, input } from '@angular/core';

/** Esqueleto de carga: una tarjeta con N líneas grises. */
@Component({
  selector: 'app-skeleton',
  template: `
    <div class="card" aria-busy="true" aria-label="Cargando">
      <div class="line w40"></div>
      @for (i of rowsArr(); track i) {
        <div class="line"></div>
      }
    </div>
  `,
  styles: `
    .line { height: 14px; border-radius: 7px; background: var(--track); margin: 12px 0; animation: pulse 1.2s ease-in-out infinite; }
    .line:first-child { margin-top: 0; }
    .w40 { width: 40%; height: 16px; }
    @keyframes pulse { 50% { opacity: 0.5; } }
    @media (prefers-reduced-motion: reduce) { .line { animation: none; } }
  `,
})
export class Skeleton {
  readonly rows = input(3);
  protected rowsArr = () => Array.from({ length: this.rows() }, (_, i) => i);
}
