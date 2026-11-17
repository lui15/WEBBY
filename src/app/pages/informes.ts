import { Component, computed, inject, signal } from '@angular/core';
import { IonContent, IonIcon } from '@ionic/angular';
import { Router } from '@angular/router';
import { DataService } from '../core/data.service';
import { HuellaService, WEBBY_URL } from '../core/huella.service';
import { SupabaseService } from '../core/supabase.service';
import { delta, fmt, shortRange } from '../core/format';
import { SiteFilter, SiteId, WeeklyReport } from '../core/models';
import { ActionList } from '../shared/action-list';
import { AgentAvatar } from '../shared/agent-avatar';
import { ChipOption, ChipSelector } from '../shared/chip-selector';
import { PageHeader } from '../shared/page-header';

@Component({
  selector: 'app-informes',
  host: { class: 'ion-page' },
  imports: [IonContent, IonIcon, PageHeader, AgentAvatar, ActionList, ChipSelector],
  template: `
    <ion-content>
      <app-page-header kicker="Cada lunes a las 7:00" title="Informes" />
      <div class="page">
        @let r = open();
        <div class="grid-2">
          <section class="card latest">
            <span class="pill new">{{ r.id === latest()?.id ? 'Nuevo · ' : '' }}{{ range(r) }}</span>
            <p class="summary">{{ r.resumen }}</p>
            <ul class="rows">
              @for (row of r.filas; track row.siteId) {
                @let s = data.site(row.siteId);
                @let d = delta(row.solicitudes, row.solicitudesPrev);
                <li>
                  <span class="name"><span class="dot" [style.background]="'var(' + s.colorVar + ')'"></span>{{ s.nombre }}</span>
                  <span class="muted small">{{ fmt(row.entraron) }} entraron</span>
                  <span class="req" [class]="'req ' + d.dir" [attr.aria-label]="row.solicitudes + ' solicitudes, ' + d.aria">
                    {{ row.solicitudes }} solicitudes {{ d.dir === 'up' ? '▲' : d.dir === 'down' ? '▼' : '' }}
                  </span>
                </li>
              }
            </ul>
            <p class="did">
              <ion-icon name="git-merge-outline" aria-hidden="true" />
              {{ didText() }}
            </p>
            @if (r.recomendaciones.length) {
              @if (full()) {
                <p class="label">Recomendaciones de la semana</p>
                <ol class="recs">
                  @for (t of r.recomendaciones; track t) { <li>{{ t }}</li> }
                </ol>
              }
              <button type="button" class="btn btn-solid wide" (click)="full.set(!full())" [attr.aria-expanded]="full()">
                {{ full() ? 'Ocultar el informe completo' : 'Leer el informe completo' }}
              </button>
            }
          </section>

          @if (r.equipo.length) {
            <section class="card">
              <h2 class="card-title">Lo que dice tu equipo</h2>
              <ul class="team">
                @for (e of r.equipo; track e.agentId) {
                  <li>
                    <app-agent-avatar [agent]="data.agent(e.agentId)" [size]="28" [showBadge]="false" />
                    <p><strong>{{ data.agent(e.agentId).nombre }}:</strong> {{ e.texto }}</p>
                  </li>
                }
              </ul>
            </section>
          }

          <section class="card span-2" id="cambios">
            <div class="card-head">
              <h2 class="card-title">Lo que has hecho en tus webs</h2>
              <span class="small muted">{{ allHistory() ? 'Todo' : range(r) }}</span>
            </div>
            <p class="small muted intro">
              Cambios en el código (también los que haces tú a mano), propuestas que aprobaste o rechazaste,
              objetivos y tu ficha de Google Maps.
            </p>
            <app-chip-selector label="Filtrar por web" [options]="siteOptions" [(value)]="actionSite" />
            <app-action-list [actions]="weekActions()" emptyText="Esta semana no hubo cambios en esta web." />
            <button type="button" class="btn wide more" (click)="allHistory.set(!allHistory())">
              {{ allHistory() ? 'Ver solo esta semana' : 'Ver todo el historial' }}
            </button>
          </section>

          <section class="card">
            <h2 class="card-title">Semanas anteriores</h2>
            <ul class="weeks">
              @for (w of data.reports(); track w.id) {
                <li>
                  <button type="button" (click)="select(w)" [class.cur]="w.id === r.id" [attr.aria-current]="w.id === r.id">
                    <span>{{ range(w) }}</span>
                    <span class="muted small">{{ total(w) }} solicitudes</span>
                    <ion-icon name="chevron-forward-outline" aria-hidden="true" />
                  </button>
                </li>
              } @empty {
                <li class="muted small">Aún no hay informes.</li>
              }
            </ul>
          </section>

          <section class="card">
            <div class="card-head">
              <h2 class="card-title">Objetivos del mes</h2>
              <button type="button" class="btn-link small" (click)="editing.set(!editing())">
                <ion-icon [name]="editing() ? 'checkmark-outline' : 'create-outline'" aria-hidden="true" />
                {{ editing() ? 'Listo' : 'Editar' }}
              </button>
            </div>
            @for (g of data.goals(); track g.siteId) {
              @let s = data.site(g.siteId);
              <div class="goal">
                <span class="name"><span class="dot" [style.background]="'var(' + s.colorVar + ')'"></span>{{ s.nombre }}</span>
                @if (editing()) {
                  <label class="sr-only" [for]="'g-' + g.siteId">Solicitudes al mes para {{ s.nombre }}</label>
                  <input type="number" min="1" max="999" inputmode="numeric" [id]="'g-' + g.siteId"
                         [value]="g.objetivo" (change)="setGoal(g.siteId, $event)" />
                } @else {
                  <span class="small"><strong>{{ g.objetivo }}</strong>&nbsp;<span class="muted">solicitudes al mes</span></span>
                }
              </div>
            }
            <p class="small muted hint">Tu equipo te ayudará a llegar a estos números.</p>
          </section>
        </div>
        @if (huella) {
          <button type="button" class="btn wide fp" (click)="activarHuella()">
            <ion-icon name="finger-print-outline" aria-hidden="true" />
            {{ huellaMsg() ?? (huellaActiva() ? 'Volver a guardar mi huella' : 'Entrar con huella en este dispositivo') }}
          </button>
        } @else if (otroDominio) {
          <a class="btn wide fp" [href]="webbyUrl">
            <ion-icon name="finger-print-outline" aria-hidden="true" /> Abrir en webby.armamuebles.es para usar la huella
          </a>
        }
        <button type="button" class="btn-link small out" (click)="signOut()">Cerrar sesión</button>
      </div>
    </ion-content>
  `,
  styles: `
    .fp { margin-top: 16px; display: flex; align-items: center; justify-content: center; gap: 8px; text-decoration: none; color: var(--text); text-align: center; }
    .latest { display: flex; flex-direction: column; gap: 12px; }
    .new { align-self: flex-start; background: var(--soft-green); color: var(--up); }
    .summary { margin: 0; font-family: var(--font-title); font-size: 22px; font-weight: 600; line-height: 1.3; letter-spacing: -0.01em; }
    .rows { list-style: none; margin: 0; padding: 0; }
    .rows li { display: grid; grid-template-columns: 1fr auto auto; gap: 12px; align-items: center; padding: 10px 0; border-top: 1px solid var(--border); }
    .name { display: inline-flex; align-items: center; gap: 8px; font-weight: 600; }
    .req { font-weight: 700; font-size: 13px; }
    .req.up { color: var(--up); }
    .req.down { color: var(--down); }
    .recs { margin: 0; padding-left: 20px; line-height: 1.6; }
    .label { margin: 4px 0 -4px; }
    .wide { width: 100%; }
    .team { list-style: none; margin: 12px 0 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
    .team li { display: flex; gap: 10px; align-items: flex-start; }
    .team p { margin: 3px 0 0; line-height: 1.45; }
    .weeks { list-style: none; margin: 8px 0 0; padding: 0; }
    .weeks button {
      width: 100%; min-height: 52px; display: grid; grid-template-columns: 1fr auto auto; gap: 10px; align-items: center;
      background: none; border: 0; border-top: 1px solid var(--border); padding: 0; text-align: left; cursor: pointer; font-size: 14px;
    }
    .weeks li:first-child button { border-top: 0; }
    .weeks button.cur span:first-child { font-weight: 700; }
    .weeks ion-icon { color: var(--muted); }
    .goal { display: flex; align-items: center; justify-content: space-between; min-height: 44px; }
    .goal input {
      width: 88px; height: 44px; padding: 0 12px; border-radius: 12px; border: 1px solid var(--border);
      background: var(--bg); color: var(--text); font: inherit; font-weight: 700; text-align: right;
    }
    .hint { margin: 8px 0 0; }
    .did { display: flex; gap: 8px; align-items: flex-start; margin: 0; padding: 10px 12px; border-radius: 12px; background: var(--track); font-size: 13px; line-height: 1.45; }
    .did ion-icon { flex: none; font-size: 16px; margin-top: 1px; }
    .intro { margin: -4px 0 8px; line-height: 1.45; }
    .more { margin-top: 12px; }
    .out { align-self: center; color: var(--muted); margin-top: 8px; }
  `,
})
export class InformesPage {
  protected readonly data = inject(DataService);
  private readonly sb = inject(SupabaseService);
  private readonly router = inject(Router);

  private readonly hs = inject(HuellaService);
  protected readonly huella = this.hs.modo;
  protected readonly otroDominio = this.hs.otroDominio;
  protected readonly webbyUrl = WEBBY_URL;
  protected readonly huellaMsg = signal<string | null>(null);
  protected readonly huellaActiva = signal(this.hs.activada());

  protected async activarHuella(): Promise<void> {
    const err = await this.hs.activar();
    if (!err) this.huellaActiva.set(true);
    this.huellaMsg.set(err ?? 'Huella activada: la próxima vez entra con ella.');
  }

  protected async signOut(): Promise<void> {
    await this.sb.signOut();
    this.router.navigateByUrl('/entrar', { replaceUrl: true });
  }
  protected readonly latest = computed(() => this.data.reports()[0] ?? null);
  private readonly selectedId = signal<string | null>(null);
  /** Informe abierto; si aún no hay ninguno, uno vacío que explica cuándo llega el primero. */
  protected readonly open = computed<WeeklyReport>(() => {
    const all = this.data.reports();
    const r = all.find((x) => x.id === this.selectedId()) ?? all[0];
    if (r) return r;
    const hoy = new Date();
    const lunes = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - ((hoy.getDay() + 6) % 7));
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return {
      id: 'ninguno', semanaInicio: iso(lunes), semanaFin: iso(new Date(lunes.getTime() + 6 * 864e5)),
      resumen: 'Tu primer informe llegará el lunes a las 7:00, con lo que ha pasado en tus tres webs.',
      filas: [], equipo: [], recomendaciones: [],
    };
  });
  protected readonly full = signal(false);
  protected readonly editing = signal(false);
  protected readonly fmt = fmt;
  protected readonly delta = delta;

  protected range(r: WeeklyReport): string {
    return shortRange(r.semanaInicio, r.semanaFin);
  }

  protected total(r: WeeklyReport): number {
    return r.filas.reduce((n, f) => n + f.solicitudes, 0);
  }

  protected select(r: WeeklyReport): void {
    this.selectedId.set(r.id);
    this.full.set(false);
  }

  protected setGoal(siteId: SiteId, ev: Event): void {
    const v = Number((ev.target as HTMLInputElement).value);
    if (!Number.isFinite(v) || v < 1) return;
    this.data.setGoal(siteId, Math.round(v));
  }

  // ----- Lo que has hecho en tus webs -----

  protected readonly actionSite = signal<SiteFilter>('todas');
  protected readonly allHistory = signal(false);
  protected readonly siteOptions: ChipOption<SiteFilter>[] = [
    { value: 'todas', label: 'Todas' },
    ...this.data.sites.map((s) => ({ value: s.id, label: s.nombre, dotVar: s.colorVar })),
  ];

  /** Acciones de la semana del informe abierto (de lunes 00:00 a lunes siguiente 00:00). */
  private readonly inWeek = computed(() => {
    const r = this.open();
    const from = new Date(`${r.semanaInicio}T00:00:00`).getTime();
    const to = new Date(`${r.semanaFin}T00:00:00`).getTime() + 86_400_000;
    return this.data.actions().filter((a) => {
      const t = new Date(a.fecha).getTime();
      return t >= from && t < to;
    });
  });

  protected readonly weekActions = computed(() => {
    const site = this.actionSite();
    const list = this.allHistory() ? this.data.actions() : this.inWeek();
    return site === 'todas' ? list : list.filter((a) => a.siteId === site);
  });

  protected readonly didText = computed(() => {
    const list = this.inWeek();
    const code = list.filter((a) => a.tipo === 'cambio_web' || a.tipo === 'cambio_manual').length;
    if (!list.length) return 'Esta semana no hiciste cambios en tus webs.';
    const acc = list.length === 1 ? '1 acción' : `${list.length} acciones`;
    const cod = code === 1 ? '1 cambio en el código' : `${code} cambios en el código`;
    return `Esta semana: ${acc} en tus webs, ${cod}. Mira abajo cuáles y qué efecto tuvieron.`;
  });
}
