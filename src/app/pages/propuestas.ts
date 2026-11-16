import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { IonContent, IonIcon } from '@ionic/angular';
import { DataService } from '../core/data.service';
import { Proposal, ProposalState } from '../core/models';
import { PageHeader } from '../shared/page-header';
import { ProposalCard } from '../shared/proposal-card';
import { SegmentOption, Segmented } from '../shared/segmented';

type Tab = 'pendientes' | 'aprobadas' | 'rechazadas';
const APPROVED: ProposalState[] = ['aprobada', 'en_progreso', 'pr_abierto', 'fusionada'];
const UNDO_MS = 5000;

@Component({
  selector: 'app-propuestas',
  host: { class: 'ion-page' },
  imports: [IonContent, IonIcon, PageHeader, Segmented, ProposalCard],
  template: `
    <ion-content>
      <app-page-header kicker="Nada cambia sin tu permiso" title="Propuestas" />
      <div class="page">
        <app-segmented label="Estado" [options]="tabs()" [(value)]="tab" />

        @let list = visible();
        @if (!list.length) {
          <div class="card empty">
            <p class="card-title">{{ emptyTitle() }}</p>
            <p class="muted">{{ emptyText() }}</p>
          </div>
        } @else if (tab() === 'pendientes') {
          <div class="grid-2">
            <app-proposal-card [p]="list[0]" (approve)="decide($event, 'aprobada')"
                               (reject)="decide($event, 'rechazada')" (askChanges)="ask($event)" />
            @if (list.length > 1) {
              <div class="stack">
                <p class="label">También pendientes</p>
                @for (p of list.slice(1); track p.id) {
                  <button type="button" class="as-card" (click)="promote(p)" [attr.aria-label]="'Ver propuesta: ' + p.titulo">
                    <app-proposal-card [p]="p" [compact]="true" />
                  </button>
                }
              </div>
            }
          </div>
        } @else {
          <div class="stack">
            @if (prMsg(); as m) { <p class="err" role="alert">{{ m }}</p> }
            @for (p of list; track p.id) {
              <app-proposal-card [p]="p" [compact]="true" [busy]="launching() === p.id" (build)="launch($event)" />
            }
          </div>
        }
      </div>

      @if (lastAction(); as act) {
        <div class="snack" role="status">
          <span>{{ act.text }}</span>
          <button type="button" class="btn-link undo" (click)="undo()">
            <ion-icon name="arrow-undo-outline" aria-hidden="true" /> Deshacer
          </button>
        </div>
      }
    </ion-content>
  `,
  styles: `
    .stack { display: flex; flex-direction: column; gap: 10px; }
    .stack .label { margin: 4px 0 0; }
    .as-card { display: block; width: 100%; padding: 0; border: 0; background: none; text-align: left; cursor: pointer; border-radius: var(--radius-card); }
    .empty p { margin: 0; }
    .empty .muted { margin-top: 6px; line-height: 1.5; }
    .snack {
      position: fixed; left: var(--gutter); right: var(--gutter); bottom: 16px; z-index: 10;
      max-width: 480px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 6px 8px 6px 16px; border-radius: 14px; background: var(--sel-bg); color: var(--sel-text);
      font-size: 14px; box-shadow: 0 6px 24px rgb(0 0 0 / 0.18);
    }
    .undo { color: inherit; padding: 0 8px; }
    .err { margin: 0; color: #B42318; font-size: 14px; }
  `,
})
export class PropuestasPage {
  protected readonly data = inject(DataService);
  protected readonly tab = signal<Tab>('pendientes');
  /** Propuesta pendiente que se muestra completa arriba. */
  private readonly focusId = signal<string | null>(null);
  protected readonly lastAction = signal<{ id: string; prev: ProposalState; text: string } | null>(null);
  private undoTimer?: ReturnType<typeof setTimeout>;
  protected readonly launching = signal<string | null>(null);
  protected readonly prMsg = signal<string | null>(null);

  constructor() {
    // Mira en GitHub cómo van los cambios en marcha, ahora y cada 30 s mientras estés aquí.
    void this.data.refreshPrs();
    const t = setInterval(() => void this.data.refreshPrs(), 30_000);
    inject(DestroyRef).onDestroy(() => clearInterval(t));
  }

  protected async launch(p: Proposal): Promise<void> {
    this.launching.set(p.id);
    this.prMsg.set(await this.data.launchPr(p.id));
    this.launching.set(null);
  }

  protected readonly tabs = computed<SegmentOption<Tab>[]>(() => [
    { value: 'pendientes', label: 'Pendientes', count: this.data.pendingCount() },
    { value: 'aprobadas', label: 'Aprobadas' },
    { value: 'rechazadas', label: 'Rechazadas' },
  ]);

  protected readonly visible = computed(() => {
    const all = this.data.proposals();
    const t = this.tab();
    if (t === 'pendientes') {
      const pend = all.filter((p) => p.estado === 'pendiente');
      const f = pend.findIndex((p) => p.id === this.focusId());
      if (f > 0) pend.unshift(...pend.splice(f, 1));
      return pend;
    }
    return all.filter((p) => (t === 'aprobadas' ? APPROVED.includes(p.estado) : p.estado === 'rechazada'));
  });

  protected readonly emptyTitle = computed(() =>
    this.tab() === 'pendientes' ? 'Todo al día' : this.tab() === 'aprobadas' ? 'Aún no has aprobado nada' : 'No has rechazado nada',
  );
  protected readonly emptyText = computed(() =>
    this.tab() === 'pendientes'
      ? 'Cuando tu equipo tenga una idea, te llegará un aviso al móvil y la verás aquí.'
      : 'Las propuestas aparecerán aquí cuando decidas sobre ellas.',
  );

  protected promote(p: Proposal): void {
    this.focusId.set(p.id);
  }

  protected decide(p: Proposal, estado: ProposalState): void {
    this.data.setProposalState(p.id, estado);
    const text = estado === 'aprobada'
      ? 'Aprobada. En «Aprobadas» puedes pedir a Desarrollo que haga el cambio.'
      : 'Propuesta rechazada.';
    this.lastAction.set({ id: p.id, prev: p.estado, text });
    clearTimeout(this.undoTimer);
    this.undoTimer = setTimeout(() => this.lastAction.set(null), UNDO_MS);
  }

  protected undo(): void {
    const a = this.lastAction();
    if (!a) return;
    clearTimeout(this.undoTimer);
    this.data.setProposalState(a.id, a.prev);
    this.lastAction.set(null);
  }

  protected ask(p: Proposal): void {
    // Fase 5: abrirá el chat del agente con la propuesta como contexto.
    this.lastAction.set(null);
    alert(`Pronto podrás decirle a ${this.data.agent(p.agentId).nombre} qué cambiar desde el chat.`);
  }
}
