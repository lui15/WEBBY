import { Component, computed, inject, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { DataService } from '../core/data.service';
import { timeAgo } from '../core/format';
import { Proposal } from '../core/models';
import { AgentAvatar } from './agent-avatar';

/** Tarjeta de propuesta: completa (pendientes) o compacta (listas). */
@Component({
  selector: 'app-proposal-card',
  imports: [IonIcon, AgentAvatar],
  template: `
    <article class="card" [class.compact]="compact()">
      <header class="top">
        <app-agent-avatar [agent]="agent()" [size]="compact() ? 36 : 44" [showBadge]="false" />
        <div class="meta">
          <h3>{{ p().titulo }}</h3>
          <p class="by">{{ by() }}</p>
        </div>
        <span class="pill">
          <span class="dot" [style.background]="'var(' + site().colorVar + ')'"></span>{{ site().nombre }}
        </span>
      </header>

      @if (!compact()) {
        <section>
          <p class="label">Qué quiero hacer</p>
          <p>{{ p().que }}</p>
        </section>
        <section>
          <p class="label">Por qué</p>
          <p>{{ p().porque }}</p>
        </section>

        @if (p().archivos.length) {
          <section>
            <p class="label">Cambios en tu código</p>
            <ul class="files">
              @for (f of p().archivos; track f.ruta) {
                <li [class]="f.tipo">
                  <span class="tag">{{ f.tipo === 'nuevo' ? 'nuevo' : 'cambia' }}</span>
                  <code>{{ f.ruta }}</code>
                </li>
              }
            </ul>
            <p class="branch">
              <ion-icon name="git-branch-outline" aria-hidden="true" />
              Se hará en una rama aparte ({{ p().rama }}). Tu web no cambia hasta que revises y aceptes el Pull Request.
            </p>
          </section>
        } @else {
          <p class="branch">
            <ion-icon name="document-text-outline" aria-hidden="true" />
            Es solo un informe: no toca tu web ni gasta dinero.
          </p>
        }

        <div class="btns">
          <button type="button" class="btn" (click)="reject.emit(p())">Rechazar</button>
          <button type="button" class="btn approve" (click)="approve.emit(p())">
            <ion-icon name="checkmark-outline" aria-hidden="true" />
            Aprobar e implementar
          </button>
        </div>
        <button type="button" class="btn-link ask" (click)="askChanges.emit(p())">
          <ion-icon name="create-outline" aria-hidden="true" /> Pedir cambios
        </button>
      } @else {
        <p class="state">{{ stateText() }}</p>
        @if (p().estado === 'aprobada') {
          <button type="button" class="btn approve go" (click)="build.emit(p())" [disabled]="busy()">
            <ion-icon name="git-branch-outline" aria-hidden="true" />
            {{ busy() ? 'Enviando a GitHub…' : 'Que Desarrollo haga el cambio' }}
          </button>
        }
        @if (p().prUrl) {
          <a class="btn go" [href]="p().prUrl" target="_blank" rel="noopener">
            <ion-icon name="logo-github" aria-hidden="true" /> Ver el Pull Request
          </a>
        }
      }
    </article>
  `,
  styles: `
    .top { display: flex; align-items: flex-start; gap: 12px; }
    .meta { flex: 1; min-width: 0; }
    h3 { margin: 0; font-size: 15px; font-weight: 700; line-height: 1.3; }
    .by { margin: 2px 0 0; font-size: 12px; color: var(--muted); }
    section { margin-top: 14px; }
    section p:not(.label) { margin: 4px 0 0; line-height: 1.5; }
    .label { margin: 0; }
    .files { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
    .files li { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .files code { font-family: var(--font-mono); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tag { flex: none; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 10px; }
    .nuevo .tag { background: var(--soft-green); color: var(--up); }
    .nuevo code { color: var(--up); }
    .modificado .tag { background: var(--soft-orange); color: var(--obralocal); }
    .modificado code { color: var(--obralocal); }
    .branch {
      display: flex; gap: 8px; align-items: flex-start; margin: 12px 0 0; padding: 10px 12px;
      border-radius: 12px; background: var(--track); font-size: 12px; color: var(--muted); line-height: 1.45;
    }
    .branch ion-icon { flex: none; font-size: 16px; margin-top: 1px; }
    .btns { display: grid; grid-template-columns: 1fr 1.6fr; gap: 8px; margin-top: 16px; }
    .approve { background: #6D28D9; color: #fff; border-color: #6D28D9; }
    .ask { margin-top: 4px; color: var(--muted); font-size: 13px; }
    .compact { padding: 12px 14px; }
    .compact h3 { font-size: 14px; }
    .state { margin: 8px 0 0 48px; font-size: 12px; color: var(--muted); }
    .go { display: flex; align-items: center; justify-content: center; gap: 6px; margin: 10px 0 0 48px; text-decoration: none; }
  `,
})
export class ProposalCard {
  readonly p = input.required<Proposal>();
  readonly compact = input(false);
  readonly approve = output<Proposal>();
  readonly reject = output<Proposal>();
  readonly askChanges = output<Proposal>();
  readonly build = output<Proposal>();
  readonly busy = input(false);

  private readonly data = inject(DataService);
  protected readonly agent = computed(() => this.data.agent(this.p().agentId));
  protected readonly site = computed(() => this.data.site(this.p().siteId));
  protected readonly by = computed(() => {
    const p = this.p();
    const idea = p.ideaDe ? ` · idea de ${this.data.agent(p.ideaDe).nombre}` : '';
    return `${this.agent().nombre}${idea} · ${timeAgo(p.createdAt)}`;
  });
  protected readonly stateText = computed(() => {
    const map: Record<Proposal['estado'], string> = {
      pendiente: 'Esperando tu respuesta',
      aprobada: 'Aprobada · pulsa el botón para que Desarrollo haga el cambio',
      en_progreso: 'Desarrollo está haciendo el cambio en GitHub (unos minutos)',
      pr_abierto: 'Pull Request listo para revisar',
      fusionada: 'Ya está en tu web',
      rechazada: 'La rechazaste',
    };
    return map[this.p().estado];
  });
}
