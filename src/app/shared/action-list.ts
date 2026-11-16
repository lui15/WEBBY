import { Component, computed, inject, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { DataService } from '../core/data.service';
import { ActionKind, WebAction } from '../core/models';

const KIND: Record<ActionKind, { icon: string; label: string; colorVar: string; softVar: string }> = {
  cambio_web: { icon: 'git-merge-outline', label: 'Cambio publicado', colorVar: '--armamuebles', softVar: '--soft-green' },
  cambio_manual: { icon: 'pencil-outline', label: 'Cambio hecho por ti', colorVar: '--mudanzas', softVar: '--soft-blue' },
  aprobada: { icon: 'checkmark-circle-outline', label: 'Propuesta aprobada', colorVar: '--armamuebles', softVar: '--soft-green' },
  rechazada: { icon: 'close-circle-outline', label: 'Propuesta rechazada', colorVar: '--muted', softVar: '--track' },
  objetivo: { icon: 'flag-outline', label: 'Objetivo', colorVar: '--obralocal', softVar: '--soft-orange' },
  resena: { icon: 'star-outline', label: 'Reseñas', colorVar: '--obralocal', softVar: '--soft-orange' },
  ficha: { icon: 'location-outline', label: 'Google Maps', colorVar: '--mudanzas', softVar: '--soft-blue' },
};

/** Línea de tiempo de cambios y acciones, agrupada por día. */
@Component({
  selector: 'app-action-list',
  imports: [IonIcon],
  template: `
    @for (g of groups(); track g.day) {
      <p class="day">{{ g.day }}</p>
      <ul>
        @for (a of g.items; track a.id) {
          @let k = kind(a);
          @let s = data.site(a.siteId);
          <li>
            <span class="ico" [style.background]="'var(' + k.softVar + ')'" [style.color]="'var(' + k.colorVar + ')'">
              <ion-icon [name]="k.icon" aria-hidden="true" />
            </span>
            <div class="body">
              <p class="t">{{ a.titulo }}</p>
              <p class="meta">
                <span class="dot" [style.background]="'var(' + s.colorVar + ')'"></span>
                {{ s.nombre }} · {{ k.label }} · {{ time(a.fecha) }}
              </p>
              @if (a.detalle) {
                <p class="d">{{ a.detalle }}</p>
              }
              @if (a.efecto) {
                <p class="fx" [class.up]="a.efectoDir === 'up'" [class.down]="a.efectoDir === 'down'">{{ a.efecto }}</p>
              }
              @if (a.enlace) {
                <a class="btn-link small" [href]="a.enlace" target="_blank" rel="noopener">Ver en GitHub</a>
              }
            </div>
          </li>
        }
      </ul>
    } @empty {
      <p class="empty">{{ emptyText() }}</p>
    }
  `,
  styles: `
    .day { margin: 14px 0 4px; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }
    :host > .day:first-child { margin-top: 0; }
    ul { list-style: none; margin: 0; padding: 0; }
    li { display: flex; gap: 12px; padding: 10px 0; }
    li + li { border-top: 1px solid var(--border); }
    .ico { flex: none; width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; font-size: 18px; }
    .body { flex: 1; min-width: 0; }
    .body p { margin: 0; }
    .t { font-weight: 600; line-height: 1.35; }
    .meta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 3px !important; font-size: 12px; color: var(--muted); }
    .d { margin-top: 4px !important; font-size: 13px; color: var(--muted); line-height: 1.45; }
    .fx { margin-top: 6px !important; font-size: 13px; font-weight: 600; line-height: 1.4; }
    .fx.up { color: var(--up); }
    .fx.down { color: var(--down); }
    .empty { margin: 0; color: var(--muted); line-height: 1.5; }
  `,
})
export class ActionList {
  readonly actions = input.required<WebAction[]>();
  readonly emptyText = input('No hay cambios en este periodo.');
  protected readonly data = inject(DataService);

  protected readonly groups = computed(() => {
    const out: { day: string; items: WebAction[] }[] = [];
    for (const a of this.actions()) {
      const day = this.dayName(a.fecha);
      const last = out.at(-1);
      if (last?.day === day) last.items.push(a);
      else out.push({ day, items: [a] });
    }
    return out;
  });

  protected kind(a: WebAction) {
    return KIND[a.tipo];
  }

  protected time(iso: string): string {
    return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  }

  private dayName(iso: string): string {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date(today.getTime() - 86_400_000);
    if (d.toDateString() === today.toDateString()) return 'Hoy';
    if (d.toDateString() === yesterday.toDateString()) return 'Ayer';
    return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  }
}
