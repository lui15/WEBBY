import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular';
import { DataService } from '../core/data.service';
import { dayLabel, delta, fmt } from '../core/format';
import { SiteFilter } from '../core/models';
import { AgentAvatar } from '../shared/agent-avatar';
import { ChipOption, ChipSelector } from '../shared/chip-selector';
import { FunnelRow } from '../shared/funnel-row';
import { PageHeader } from '../shared/page-header';
import { Skeleton } from '../shared/skeleton';

@Component({
  selector: 'app-inicio',
  host: { class: 'ion-page' },
  imports: [IonContent, PageHeader, ChipSelector, FunnelRow, AgentAvatar, Skeleton, RouterLink],
  template: `
    <ion-content>
      <app-page-header [kicker]="today" title="Hola, Luis" [logo]="true" />
      <div class="page">
        <app-chip-selector label="Elegir web" [options]="siteOptions" [(value)]="filter" />

        @if (data.loading()) {
          <div class="grid-2">
            <app-skeleton [rows]="4" /><app-skeleton [rows]="3" />
          </div>
        } @else {
          <div class="grid-2">
            <section class="card">
              <div class="card-head">
                <h2 class="card-title">Tu semana, en claro</h2>
                <span class="small muted">vs. semana pasada</span>
              </div>
              <app-funnel-row
                icon="eye-outline" colorVar="--mudanzas" softVar="--soft-blue"
                [value]="'Saliste en Google ' + fmt(f().vieron) + ' veces'"
                hint="Tu web apareció cuando alguien buscó algo como «reformas Madrid»."
                [delta]="delta(f().vieron, f().vieronPrev)" />
              <app-funnel-row
                icon="log-in-outline" colorVar="--obralocal" softVar="--soft-orange"
                [value]="fmt(f().entraron) + ' personas entraron a tu web'"
                [hint]="'De cada 100 que te vieron, unas ' + ratio(f().entraron, f().vieron) + ' entraron.'"
                [delta]="delta(f().entraron, f().entraronPrev)" />
              <app-funnel-row
                icon="chatbubbles-outline" colorVar="--armamuebles" softVar="--soft-green"
                [value]="fmt(f().contactaron) + ' personas te pidieron presupuesto'"
                hint="Rellenaron el formulario o te escribieron por WhatsApp."
                [delta]="delta(f().contactaron, f().contactaronPrev)" />
              <p class="leak">{{ leak() }}</p>
              <p class="small muted note">{{ data.demo() ? 'Datos de ejemplo: conecta Google en la pestaña Webs.' : 'Datos de Google de hace unos 2 días.' }}</p>
            </section>

            <section class="card">
              <div class="card-head">
                <h2 class="card-title">Tu equipo</h2>
                <a class="btn-link small" routerLink="/agentes">Hablar</a>
              </div>
              <ul class="team">
                @for (a of data.agents; track a.id) {
                  <li>
                    <a [routerLink]="['/agentes']" [queryParams]="{ a: a.id }" class="member"
                       [attr.aria-label]="a.nombre + ', ' + a.especialidad + (a.avisos ? ', ' + a.avisos + ' avisos' : '')">
                      <app-agent-avatar [agent]="a" [size]="48" />
                      <span class="nm">{{ a.nombre }}</span>
                      <span class="sp">{{ a.especialidad }}</span>
                    </a>
                  </li>
                }
              </ul>
            </section>

            <section class="card span-2">
              <div class="card-head">
                <h2 class="card-title">Objetivos del mes</h2>
                <a class="btn-link small" routerLink="/informes">Editar</a>
              </div>
              @for (g of data.goals(); track g.siteId) {
                @let s = data.site(g.siteId);
                <div class="goal">
                  <div class="goal-top">
                    <span class="gname"><span class="dot" [style.background]="'var(' + s.colorVar + ')'"></span>{{ s.nombre }}</span>
                    <span class="small"><strong>{{ g.actual }}</strong>&nbsp;<span class="muted">/ {{ g.objetivo }} solicitudes</span></span>
                  </div>
                  <div class="bar" role="progressbar" [attr.aria-valuenow]="g.actual" aria-valuemin="0"
                       [attr.aria-valuemax]="g.objetivo" [attr.aria-label]="s.nombre + ': ' + g.actual + ' de ' + g.objetivo + ' solicitudes'">
                    <span [style.width.%]="(g.actual / g.objetivo) * 100" [style.background]="'var(' + s.colorVar + ')'"></span>
                  </div>
                </div>
              }
            </section>
          </div>
        }
      </div>
    </ion-content>
  `,
  styles: `
    .leak { margin: 8px 0 0; padding: 10px 12px; border-radius: 12px; background: var(--track); font-size: 13px; line-height: 1.45; }
    .note { margin: 8px 0 0; }
    .team { list-style: none; margin: 0 -16px; padding: 0 16px 2px; display: grid; grid-auto-flow: column; grid-auto-columns: 78px; gap: 6px; overflow-x: auto; scrollbar-width: none; }
    .team::-webkit-scrollbar { display: none; }
    @media (min-width: 460px) { .team { margin: 0; padding: 0; grid-auto-flow: row; grid-template-columns: repeat(5, minmax(0, 1fr)); overflow: visible; } }
    .member { display: flex; flex-direction: column; align-items: center; gap: 6px; text-decoration: none; color: inherit; text-align: center; min-height: 44px; padding: 4px 0; }
    .nm { font-size: 11.5px; font-weight: 700; letter-spacing: -0.01em; white-space: nowrap; }
    @media (max-width: 459px) { .sp { display: none; } }
    .sp { font-size: 11px; color: var(--muted); line-height: 1.3; }
    .goal + .goal { margin-top: 14px; }
    .goal-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
    .gname { display: inline-flex; align-items: center; gap: 8px; font-weight: 600; }
    .bar { height: 10px; border-radius: 5px; background: var(--track); overflow: hidden; }
    .bar span { display: block; height: 100%; border-radius: 5px; }
  `,
})
export class InicioPage {
  protected readonly data = inject(DataService);
  protected readonly today = dayLabel();
  protected readonly filter = signal<SiteFilter>('todas');
  protected readonly f = computed(() => this.data.funnel(this.filter()));
  protected readonly fmt = fmt;
  protected readonly delta = delta;

  protected readonly siteOptions: ChipOption<SiteFilter>[] = [
    { value: 'todas', label: 'Todas' },
    ...this.data.sites.map((s) => ({ value: s.id, label: s.nombre, dotVar: s.colorVar })),
  ];

  protected ratio(a: number, b: number): string {
    return b ? fmt(Math.round((a / b) * 100)) : '0';
  }

  /** Dice en qué paso del embudo se pierde más gente. */
  protected readonly leak = computed(() => {
    const f = this.f();
    const entrar = f.vieron ? f.entraron / f.vieron : 0;
    const contactar = f.entraron ? f.contactaron / f.entraron : 0;
    return entrar < 0.05
      ? 'Donde más gente se pierde: te ven en Google pero pocos entran. Mejorar los títulos que salen en Google ayudaría.'
      : contactar < 0.1
        ? 'Donde más gente se pierde: entran a tu web pero pocos te piden presupuesto. Revisar el formulario ayudaría.'
        : 'El embudo va bien: no hay un paso donde se pierda mucha gente.';
  });
}
