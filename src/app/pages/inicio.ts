import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonContent, IonIcon } from '@ionic/angular';
import { DataService } from '../core/data.service';
import { dayLabel, delta, fmt, timeAgo } from '../core/format';
import { AgentAvatar } from '../shared/agent-avatar';
import { CountUp } from '../shared/count-up';
import { PageHeader } from '../shared/page-header';
import { SiteCompare } from '../shared/site-compare';
import { Skeleton } from '../shared/skeleton';

@Component({
  selector: 'app-inicio',
  host: { class: 'ion-page' },
  imports: [IonContent, IonIcon, PageHeader, AgentAvatar, Skeleton, RouterLink, SiteCompare, CountUp],
  template: `
    <ion-content>
      <app-page-header [kicker]="saludo + ' · ' + today" title="Hola, Luis" [logo]="true" />
      <div class="page">
        @if (data.loading()) {
          <app-skeleton [rows]="4" />
          <div class="sites"><app-skeleton [rows]="3" /><app-skeleton [rows]="3" /><app-skeleton [rows]="3" /></div>
        } @else {

          <!-- 1. Resumen de la semana -->
          <section class="card hero" aria-labelledby="h-resumen">
            <div class="hero-top">
              <p class="label" id="h-resumen">Tus 3 webs · últimos 7 días</p>
              @if (data.demo()) { <span class="pill demo">Ejemplo</span> }
            </div>
            <p class="headline">{{ headline() }}</p>

            <ul class="kpis">
              @for (k of kpis(); track k.label) {
                <li>
                  <span class="ico" [style.background]="'var(' + k.soft + ')'" [style.color]="'var(' + k.color + ')'">
                    <ion-icon [name]="k.icon" aria-hidden="true" />
                  </span>
                  <p class="num big"><app-count [value]="k.n" /></p>
                  <p class="klabel">{{ k.label }}</p>
                  <p class="kd" [class]="'kd ' + k.d.dir" [attr.aria-label]="k.d.aria">{{ k.d.text }}</p>
                </li>
              }
            </ul>

            <p class="leak">
              <ion-icon name="bulb-outline" aria-hidden="true" />
              <span>{{ leak() }}</span>
            </p>
            <p class="small muted note">{{ note() }}</p>
          </section>

          <!-- 2. Tus webs -->
          <h2 class="sec">Tus webs</h2>
          <div class="sites">
            @for (c of siteCards(); track c.id) {
              <a class="card site" [routerLink]="['/webs']" [queryParams]="{ web: c.id }"
                 [style.--c]="'var(' + c.colorVar + ')'" [attr.aria-label]="c.aria">
                <div class="s-head">
                  <span class="s-name"><span class="dot"></span>{{ c.nombre }}</span>
                  <ion-icon name="chevron-forward-outline" aria-hidden="true" />
                </div>
                <p class="s-dom small muted">{{ c.dominio }}</p>
                <div class="s-main">
                  <p><span class="num s-big"><app-count [value]="c.n" /></span>&nbsp;<span class="small muted">entraron</span></p>
                  <span class="kd" [class]="'kd ' + c.d.dir">{{ c.d.text }}</span>
                </div>
                <p class="small s-req">
                  <strong>{{ c.contactaron }}</strong> {{ c.contactaron === '1' ? 'pidió' : 'pidieron' }} precio esta semana
                </p>
                <div class="goal">
                  <div class="g-top small">
                    <span class="muted">Objetivo del mes</span>
                    <span><strong>{{ c.actual }}</strong> / {{ c.objetivo }}</span>
                  </div>
                  <div class="bar" role="progressbar" aria-valuemin="0" [attr.aria-valuemax]="c.objetivo" [attr.aria-valuenow]="c.actual"
                       [attr.aria-label]="'Objetivo de ' + c.nombre + ': ' + c.actual + ' de ' + c.objetivo + ' solicitudes'">
                    <span [style.width.%]="c.pct"></span>
                  </div>
                </div>
              </a>
            }
          </div>

          <!-- 3. Comparar + 4. Equipo -->
          <div class="two">
            <div class="col">
              <h2 class="sec">Comparar</h2>
              <app-site-compare />
            </div>

            <div class="col">
              <h2 class="sec">Tu equipo</h2>
              <section class="card">
                <div class="card-head">
                  <h3 class="card-title">Lo que han visto</h3>
                  @if (data.pendingCount()) {
                    <a class="pill pend" routerLink="/propuestas">{{ data.pendingCount() }} propuesta{{ data.pendingCount() === 1 ? '' : 's' }}</a>
                  }
                </div>
                @if (avisos().length) {
                  <ul class="avisos">
                    @for (a of avisos(); track a.id) {
                      <li>
                        <a class="aviso" [class.unread]="!a.leido" [routerLink]="['/agentes']" [queryParams]="{ a: a.agentId ?? 'seo' }"
                           [style.--ac]="a.agentId ? data.agent(a.agentId).color : 'var(--text)'"
                           [attr.aria-label]="(a.leido ? '' : 'Sin leer. ') + a.titulo + '. Hablar con ' + (a.agentId ? data.agent(a.agentId).nombre : 'tu equipo')">
                          @if (a.agentId) {
                            <span class="a-av">
                              <app-agent-avatar [agent]="data.agent(a.agentId)" [size]="36" [showBadge]="false" />
                              @if (!a.leido) { <span class="a-dot" aria-hidden="true"></span> }
                            </span>
                          }
                          <span class="a-body">
                            <span class="a-t">{{ a.titulo }}</span>
                            <span class="a-x small muted">{{ a.texto }}</span>
                            <span class="a-m small">
                              <span class="muted">@if (a.siteId) { {{ data.site(a.siteId).nombre }} · }{{ ago(a.createdAt) }}</span>
                              <span class="a-go">Hablar con {{ a.agentId ? data.agent(a.agentId).nombre : 'tu equipo' }}
                                <ion-icon name="chevron-forward-outline" aria-hidden="true" /></span>
                            </span>
                          </span>
                        </a>
                      </li>
                    }
                  </ul>
                } @else {
                  <p class="muted empty">Tu equipo revisa tus webs cada mañana. Cuando vea algo importante, te lo contará aquí.</p>
                }
              </section>

              <section class="card">
                <ul class="team">
                  @for (a of data.agents; track a.id) {
                    <li>
                      <a [routerLink]="['/agentes']" [queryParams]="{ a: a.id }" class="member"
                         [attr.aria-label]="'Hablar con ' + a.nombre + ', ' + a.especialidad">
                        <app-agent-avatar [agent]="a" [size]="44" />
                        <span class="nm">{{ a.nombre }}</span>
                      </a>
                    </li>
                  }
                </ul>
                <a class="btn btn-solid wide rev" routerLink="/agentes" [queryParams]="{ revisar: 1 }">
                  <ion-icon name="sparkles-outline" aria-hidden="true" />
                  {{ data.reviewing() ? 'Tu equipo está revisando…' : 'Pedir revisión al equipo' }}
                </a>
                <a class="btn wide" routerLink="/agentes">
                  <ion-icon name="chatbubbles-outline" aria-hidden="true" /> Preguntar a tu equipo
                </a>
              </section>
            </div>
          </div>
        }
      </div>
    </ion-content>
  `,
  styles: `
    .sec { margin: 10px 0 -2px; font-family: var(--font-title); font-size: 17px; font-weight: 700; letter-spacing: -0.01em; }

    /* Resumen */
    .hero { display: flex; flex-direction: column; gap: 12px; padding: 18px; }
    .hero-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .hero-top .label { margin: 0; }
    .demo { background: var(--soft-orange); color: var(--obralocal); }
    .headline { margin: 0; font-family: var(--font-title); font-size: 21px; font-weight: 600; line-height: 1.3; letter-spacing: -0.01em; }
    .kpis { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
    .kpis li { padding: 12px 10px; border-radius: 14px; background: var(--bg); border: 1px solid var(--border); }
    .ico { width: 32px; height: 32px; border-radius: 10px; display: grid; place-items: center; font-size: 17px; }
    .big { margin: 10px 0 0; font-size: 26px; line-height: 1; }
    .klabel { margin: 4px 0 0; font-size: 12px; color: var(--muted); line-height: 1.3; min-height: 2.6em; }
    .kd { margin: 2px 0 0; font-size: 12px; font-weight: 700; }
    .kd.up { color: var(--up); }
    .kd.down { color: var(--down); }
    .kd.flat { color: var(--muted); }
    .leak {
      display: flex; gap: 8px; align-items: flex-start; margin: 0; padding: 10px 12px; border-radius: 12px;
      background: var(--track); font-size: 13px; line-height: 1.45;
    }
    .leak ion-icon { flex: none; font-size: 17px; margin-top: 1px; }
    .note { margin: -4px 0 0; }

    /* Webs */
    .sites { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--gap); }
    @media (min-width: 720px) { .sites { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
    .site {
      display: flex; flex-direction: column; gap: 6px; color: inherit; text-decoration: none;
      border-top: 4px solid var(--c); transition: transform 0.15s ease;
    }
    .site:hover { transform: translateY(-2px); }
    .s-head { display: flex; align-items: center; justify-content: space-between; }
    .s-name { display: inline-flex; align-items: center; gap: 8px; font-weight: 700; font-size: 15px; }
    .s-name .dot { background: var(--c); }
    .s-head ion-icon { color: var(--muted); }
    .s-dom { margin: -4px 0 0; }
    .s-main { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-top: 2px; }
    .s-main p { margin: 0; }
    .s-big { font-size: 28px; }
    .s-req { margin: 0; color: var(--muted); }
    .s-req strong { color: var(--text); }
    .goal { margin-top: 6px; }
    .g-top { display: flex; justify-content: space-between; margin-bottom: 5px; }
    .bar { height: 8px; border-radius: 4px; background: var(--track); overflow: hidden; }
    .bar span { display: block; height: 100%; background: var(--c); border-radius: 0 4px 4px 0; }

    /* Comparar + equipo */
    .two { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--gap); }
    .col { display: flex; flex-direction: column; gap: var(--gap); min-width: 0; }
    @media (min-width: 960px) { .two { grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); align-items: start; } }
    .pend { background: var(--soft-orange); color: var(--obralocal); text-decoration: none; }
    .avisos { list-style: none; margin: 0; padding: 0; }
    .avisos { display: flex; flex-direction: column; gap: 8px; }
    .aviso {
      display: flex; gap: 12px; padding: 12px; border-radius: 14px; border: 1px solid var(--border);
      border-left: 4px solid var(--ac); background: var(--bg); color: inherit; text-decoration: none;
      transition: transform 0.15s ease, box-shadow 0.2s ease;
    }
    .aviso:hover { box-shadow: 0 6px 18px rgb(0 0 0 / 0.08); }
    .aviso:active { transform: scale(0.98); }
    .aviso.unread { background: color-mix(in srgb, var(--ac) 7%, var(--card)); }
    .a-av { position: relative; flex: none; height: 36px; }
    .a-dot {
      position: absolute; top: -3px; right: -3px; width: 13px; height: 13px; border-radius: 50%;
      background: var(--badge); border: 2px solid var(--card); animation: w-pop 0.45s cubic-bezier(0.3, 1.5, 0.5, 1) both;
    }
    .a-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
    .a-t { font-weight: 700; line-height: 1.35; }
    .a-m { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 4px 10px; margin-top: 3px; }
    .a-go { display: inline-flex; align-items: center; gap: 2px; font-weight: 700; color: var(--text); }
    .a-x { margin-top: 2px !important; line-height: 1.45; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .a-m { margin-top: 3px !important; }
    .empty { margin: 0; line-height: 1.5; }
    .team { list-style: none; margin: 0 0 12px; padding: 0; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 2px; }
    .member { display: flex; flex-direction: column; align-items: center; gap: 6px; text-decoration: none; color: inherit; min-height: 44px; padding: 2px 0; }
    .nm { font-size: 11px; font-weight: 600; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .wide { width: 100%; text-decoration: none; color: var(--text); }
    .wide.rev { color: var(--sel-text); margin-bottom: 8px; }
    @media (prefers-reduced-motion: reduce) { .site { transition: none; } }
  `,
})
export class InicioPage {
  protected readonly data = inject(DataService);
  protected readonly today = dayLabel();
  protected readonly ago = timeAgo;
  protected readonly saludo = (() => {
    const h = new Date().getHours();
    return h < 13 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';
  })();

  private readonly total = computed(() => this.data.funnel('todas', 7));

  protected readonly kpis = computed(() => {
    const f = this.total();
    return [
      { icon: 'eye-outline', color: '--mudanzas', soft: '--soft-blue', n: f.vieron, label: 'veces te vieron en Google', d: delta(f.vieron, f.vieronPrev) },
      { icon: 'log-in-outline', color: '--obralocal', soft: '--soft-orange', n: f.entraron, label: 'personas entraron', d: delta(f.entraron, f.entraronPrev) },
      { icon: 'chatbubbles-outline', color: '--armamuebles', soft: '--soft-green', n: f.contactaron, label: 'pidieron precio', d: delta(f.contactaron, f.contactaronPrev) },
    ];
  });

  protected readonly headline = computed(() => {
    const f = this.total();
    if (!f.vieron && !f.entraron) return 'Todavía no hay datos de Google de esta semana. Vuelve mañana o pulsa «Actualizar».';
    const d = delta(f.entraron, f.entraronPrev);
    const como = d.dir === 'up' ? `un ${d.pct} % más que la semana anterior` : d.dir === 'down' ? `un ${Math.abs(d.pct)} % menos que la semana anterior` : 'igual que la semana anterior';
    const pide = f.contactaron ? ` y ${fmt(f.contactaron)} ${f.contactaron === 1 ? 'te pidió' : 'te pidieron'} precio` : '';
    return `Entraron ${fmt(f.entraron)} personas desde Google, ${como}${pide}.`;
  });

  /** En qué paso del embudo se pierde más gente. */
  protected readonly leak = computed(() => {
    const f = this.total();
    if (!f.vieron) return 'En cuanto lleguen datos de Google te diré dónde se pierde la gente.';
    const entrar = f.entraron / f.vieron;
    const contactar = f.entraron ? f.contactaron / f.entraron : 0;
    if (entrar < 0.05) {
      return `De cada 100 que te ven en Google, solo ${Math.max(1, Math.round(entrar * 100))} entran. Mejorar los títulos que salen en Google es lo que más ayudaría.`;
    }
    if (contactar < 0.1) return 'Entra gente, pero pocos piden presupuesto. Revisar el formulario y el botón de WhatsApp es lo que más ayudaría.';
    return 'El embudo va bien: no hay un paso donde se pierda mucha gente.';
  });

  protected readonly note = computed(() =>
    this.data.demo() ? 'Datos de ejemplo: conecta Google en la pestaña Webs.' : 'Comparado con los 7 días anteriores. Google da sus datos con unos 2 días de retraso.',
  );

  protected readonly siteCards = computed(() =>
    this.data.sites.map((s) => {
      const f = this.data.funnel(s.id, 7);
      const g = this.data.goals().find((x) => x.siteId === s.id);
      const d = delta(f.entraron, f.entraronPrev);
      const objetivo = g?.objetivo ?? 0;
      const actual = g?.actual ?? 0;
      return {
        id: s.id, nombre: s.nombre, dominio: s.dominio, colorVar: s.colorVar,
        n: f.entraron, contactaron: fmt(f.contactaron), d,
        objetivo, actual, pct: objetivo ? Math.min(100, (actual / objetivo) * 100) : 0,
        aria: `${s.nombre}: ${f.entraron} entraron, ${d.aria}; ${f.contactaron} pidieron precio; objetivo ${actual} de ${objetivo}. Ver detalle`,
      };
    }),
  );

  protected readonly avisos = computed(() => this.data.avisos().slice(0, 3));
}
