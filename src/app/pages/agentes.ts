import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonContent, IonIcon } from '@ionic/angular';
import { DataService } from '../core/data.service';
import { AgentId } from '../core/models';
import { AgentAvatar } from '../shared/agent-avatar';
import { PageHeader } from '../shared/page-header';

@Component({
  selector: 'app-agentes',
  host: { class: 'ion-page' },
  imports: [IonContent, IonIcon, PageHeader, AgentAvatar, FormsModule],
  template: `
    <ion-content>
      <app-page-header kicker="Tu equipo de IA" title="Agentes" />
      <div class="page" [style.--agent]="agent().color">
        <div class="row" role="radiogroup" aria-label="Elegir agente">
          @for (a of data.agents; track a.id) {
            <button type="button" role="radio" class="pick" [attr.aria-checked]="a.id === selected()"
                    [attr.aria-label]="a.nombre + (a.avisos ? ', ' + a.avisos + ' avisos' : '')"
                    (click)="selected.set(a.id)">
              <app-agent-avatar [agent]="a" [size]="52" [selected]="a.id === selected()" />
              <span [class.on]="a.id === selected()">{{ a.nombre }}</span>
            </button>
          }
        </div>

        <section class="card who">
          <div>
            <h2 class="card-title">{{ agent().nombre }} · {{ agent().especialidad }}</h2>
            <p class="small muted">{{ agent().descripcion }}</p>
          </div>
          @if (messages().length) {
            <button type="button" class="btn new" (click)="data.resetChat(selected())" [disabled]="!!data.thinking()">Nueva charla</button>
          }
        </section>

        <div class="chat" aria-live="polite">
          @for (m of messages(); track m.id) {
            @if (m.rol === 'yo') {
              <p class="me">{{ m.texto }}</p>
            } @else {
              <div class="card bot">
                <p class="txt">@for (seg of segs(m.texto); track $index) {@if (seg.b) {<strong>{{ seg.t }}</strong>} @else {{{ seg.t }}}}</p>
                @for (pr of m.propuestas ?? []; track pr.id) {
                  <button type="button" class="btn act" (click)="router.navigate(['/propuestas'])">
                    Propuesta guardada: {{ pr.titulo }} →
                  </button>
                }
                @if (m.lista) {
                  @let max = maxOf(m.lista);
                  <ul class="qlist">
                    @for (it of m.lista; track it.etiqueta) {
                      <li>
                        <div class="ql-top"><span>{{ it.etiqueta }}</span><strong>{{ it.valor }}</strong></div>
                        <div class="qbar"><span [style.width.%]="(it.valor / max) * 100"></span></div>
                        <span class="small muted">{{ it.detalle }}</span>
                      </li>
                    }
                  </ul>
                }
                @if (m.accion) {
                  <button type="button" class="btn act" (click)="router.navigate(['/propuestas'])">
                    {{ m.accion.texto }}
                  </button>
                }
              </div>
            }
          } @empty {
            <div class="card empty">
              <p>Todavía no has hablado con el agente de {{ agent().nombre }}. Prueba con una de las preguntas de abajo.</p>
            </div>
          }
          @if (data.thinking() === selected()) {
            <div class="card bot typing" role="status"><span></span><span></span><span></span><em class="sr-only">{{ agent().nombre }} está pensando…</em></div>
          }
          @if (data.chatError(); as err) {
            <p class="err" role="alert">{{ err }}</p>
          }
        </div>

        <div class="sugs" aria-label="Preguntas rápidas">
          @for (s of agent().sugerencias; track s) {
            <button type="button" class="chip" (click)="send(s)">{{ s }}</button>
          }
        </div>

        <form class="composer" (submit)="$event.preventDefault(); send(text())">
          <label for="msg" class="sr-only">Escribe tu pregunta al agente de {{ agent().nombre }}</label>
          <input id="msg" name="msg" [ngModel]="text()" (ngModelChange)="text.set($event)"
                 placeholder="Escribe tu pregunta…" autocomplete="off" />
          <button type="button" class="ic" aria-label="Hablar con el micrófono">
            <ion-icon name="mic-outline" aria-hidden="true" />
          </button>
          <button type="submit" class="ic send" aria-label="Enviar" [disabled]="!text().trim() || !!data.thinking()">
            <ion-icon name="send-outline" aria-hidden="true" />
          </button>
        </form>
      </div>
    </ion-content>
  `,
  styles: `
    .page { max-width: 760px; }
    .row { display: flex; gap: 6px; justify-content: space-between; }
    .pick { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; background: none; border: 0; padding: 6px 0; cursor: pointer; min-height: 44px; }
    .pick span { font-size: 12px; color: var(--muted); }
    .pick span.on { color: var(--text); font-weight: 700; }
    .who { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    .who p { margin: 4px 0 0; line-height: 1.4; }
    .chat { display: flex; flex-direction: column; gap: 10px; }
    .me { align-self: flex-end; max-width: 82%; margin: 0; padding: 12px 14px; border-radius: 18px 18px 4px 18px; background: var(--sel-bg); color: var(--sel-text); line-height: 1.45; }
    .bot { align-self: flex-start; max-width: 92%; border-radius: 18px 18px 18px 4px; }
    .bot > p { margin: 0; line-height: 1.5; }
    .qlist { list-style: none; margin: 12px 0 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
    .ql-top { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 4px; }
    .qbar { height: 8px; border-radius: 4px; background: var(--track); overflow: hidden; }
    .qbar span { display: block; height: 100%; background: var(--agent); border-radius: 4px; }
    .act { margin-top: 12px; width: 100%; border-color: #6D28D9; color: var(--text); }
    .empty p { margin: 0; color: var(--muted); }
    .txt { white-space: pre-wrap; }
    .new { flex: none; height: 36px; padding: 0 12px; font-size: 13px; }
    .err { margin: 0; color: #B42318; font-size: 14px; }
    .typing { display: flex; gap: 5px; padding: 16px; }
    .typing span { width: 8px; height: 8px; border-radius: 50%; background: var(--agent); animation: blink 1.2s infinite; }
    .typing span:nth-child(2) { animation-delay: .2s; } .typing span:nth-child(3) { animation-delay: .4s; }
    @keyframes blink { 0%, 80%, 100% { opacity: .25; } 40% { opacity: 1; } }
    .sugs { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; margin: 0 calc(var(--gutter) * -1); padding: 2px var(--gutter); }
    .chip { flex: none; height: 44px; padding: 0 14px; border-radius: var(--radius-chip); border: 1px solid var(--border); background: var(--card); font-size: 13px; font-weight: 500; cursor: pointer; white-space: nowrap; }
    .composer { display: flex; align-items: center; gap: 6px; padding: 4px 4px 4px 16px; border: 1px solid var(--border); border-radius: 28px; background: var(--card); }
    .composer input { flex: 1; min-width: 0; height: 44px; border: 0; background: transparent; color: var(--text); font: inherit; outline: none; }
    .composer input::placeholder { color: var(--muted); }
    .composer:focus-within { border-color: var(--text); }
    .ic { flex: none; width: 44px; height: 44px; border-radius: 50%; border: 0; background: transparent; display: grid; place-items: center; font-size: 20px; cursor: pointer; color: var(--muted); }
    .send { background: var(--agent); color: #fff; }
    .send:disabled { opacity: 0.45; cursor: default; }
  `,
})
export class AgentesPage {
  protected readonly data = inject(DataService);
  protected readonly router = inject(Router);

  /** ?a=desarrollo desde Inicio */
  readonly a = input<AgentId | undefined>();
  protected readonly selected = signal<AgentId>('seo');
  protected readonly agent = computed(() => this.data.agent(this.selected()));
  protected readonly messages = computed(() => this.data.messages(this.selected()));
  protected readonly text = signal('');

  constructor() {
    effect(() => {
      const a = this.a();
      if (a && this.data.agents.some((x) => x.id === a)) this.selected.set(a);
    });
    effect(() => void this.data.loadChat(this.selected()));
  }

  /** Texto del agente en trozos, con **negrita**. */
  protected segs(t: string): { t: string; b: boolean }[] {
    return t.split('**').map((x, i) => ({ t: x, b: i % 2 === 1 }));
  }

  protected maxOf(list: { valor: number }[]): number {
    return Math.max(1, ...list.map((i) => i.valor));
  }

  protected send(t: string): void {
    const msg = t.trim();
    if (!msg || this.data.thinking()) return;
    void this.data.send(this.selected(), msg);
    this.text.set('');
  }
}
