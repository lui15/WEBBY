import { Component, ElementRef, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { DataService } from '../core/data.service';
import { timeAgo } from '../core/format';
import { Agent, AgentId, ChatMessage } from '../core/models';
import { AgentAvatar } from '../shared/agent-avatar';

interface Block {
  list: boolean;
  items: { t: string; b: boolean }[][];
}

/** Chat con el equipo, al estilo de Claude: lista de agentes a un lado y la conversación ocupando la pantalla. */
@Component({
  selector: 'app-agentes',
  host: { class: 'ion-page' },
  imports: [IonIcon, AgentAvatar],
  template: `
    <div class="shell" [class.open]="drawer()" [style.--agent]="agent().color">
      <!-- Lista de agentes -->
      <aside class="side" aria-label="Tus agentes">
        <div class="side-head">
          <h1>Tu equipo</h1>
          <button type="button" class="ic only-m" aria-label="Cerrar lista" (click)="drawer.set(false)">
            <ion-icon name="close-outline" aria-hidden="true" />
          </button>
        </div>
        <div class="rev">
          @if (!reviewOpen()) {
            <button type="button" class="rev-btn" (click)="reviewOpen.set(true)" [disabled]="data.reviewing()">
              <ion-icon name="sparkles-outline" aria-hidden="true" />
              {{ data.reviewing() ? 'Tu equipo está revisando…' : 'Pedir revisión a todo el equipo' }}
            </button>
          } @else {
            <form class="rev-form" (submit)="$event.preventDefault(); startReview()">
              <label for="foco">¿En qué quieres que se fijen? <span class="muted">(opcional)</span></label>
              <textarea id="foco" rows="2" [value]="foco()" (input)="foco.set($any($event.target).value)"
                        placeholder="Ej.: los formularios, Google Maps, los precios…"></textarea>
              <div class="rev-row">
                <button type="button" class="mini" (click)="reviewOpen.set(false)">Cancelar</button>
                <button type="submit" class="mini solid">
                  <ion-icon name="sparkles-outline" aria-hidden="true" /> Pedir revisión
                </button>
              </div>
            </form>
          }
          @if (reviewMsg()) { <p class="rev-msg small" role="status">{{ reviewMsg() }}</p> }
        </div>
        <ul class="list">
          @for (a of data.agents; track a.id) {
            @let p = data.chatPreviews()[a.id];
            <li>
              <button type="button" class="item" [class.on]="a.id === selected()" (click)="pick(a.id)"
                      [attr.aria-current]="a.id === selected() ? 'true' : null"
                      [attr.aria-label]="a.nombre + (a.avisos ? ', ' + a.avisos + ' sin leer' : '')">
                <app-agent-avatar [agent]="a" [size]="44" />
                <span class="it-txt">
                  <span class="it-top">
                    <strong>{{ a.nombre }}</strong>
                    @if (p?.createdAt) { <span class="it-time">{{ ago(p!.createdAt) }}</span> }
                  </span>
                  <span class="it-sub" [class.typing-txt]="isBusy(a.id)" [class.unread]="a.avisos">
                    @if (isBusy(a.id)) { escribiendo… }
                    @else if (p) { {{ p.rol === 'yo' ? 'Tú: ' : '' }}{{ preview(p.texto) }} }
                    @else { {{ a.especialidad }} }
                  </span>
                </span>
              </button>
            </li>
          }
        </ul>
        <p class="side-foot small muted">Pídele a un agente que pase algo a otro: «pásaselo a Desarrollo».</p>
      </aside>
      <button type="button" class="backdrop" aria-label="Cerrar lista" tabindex="-1" (click)="drawer.set(false)"></button>

      <!-- Conversación -->
      <section class="main">
        <header class="top">
          <button type="button" class="ic only-m menu" aria-label="Ver todos los agentes" (click)="drawer.set(true)">
            <ion-icon name="menu-outline" aria-hidden="true" />
            @if (otherUnread()) { <span class="mdot" aria-hidden="true"></span> }
          </button>
          <app-agent-avatar [agent]="agent()" [size]="38" [showBadge]="false" />
          <div class="who">
            <p class="name">{{ agent().nombre }}</p>
            <p class="small muted status">{{ isBusy(selected()) ? 'escribiendo…' : agent().especialidad }}</p>
          </div>
          <button type="button" class="ic only-m" aria-label="Pedir revisión a todo el equipo" title="Revisión del equipo"
                  (click)="drawer.set(true); reviewOpen.set(true)">
            <ion-icon name="sparkles-outline" aria-hidden="true" />
          </button>
          @if (messages().length) {
            <button type="button" class="ic" aria-label="Empezar una charla nueva" title="Charla nueva"
                    (click)="data.resetChat(selected())" [disabled]="isBusy(selected())">
              <ion-icon name="create-outline" aria-hidden="true" />
            </button>
          }
        </header>

        <div class="scroll" #scroller>
          <div class="thread" aria-live="polite">
            @if (!messages().length && !isBusy(selected())) {
              <div class="hello">
                <app-agent-avatar [agent]="agent()" [size]="72" [showBadge]="false" />
                <h2>{{ agent().nombre }}</h2>
                <p class="muted">{{ agent().descripcion }}</p>
                <div class="sug-grid">
                  <button type="button" class="sug strong" (click)="reviewOne()">
                    <ion-icon name="sparkles-outline" aria-hidden="true" /> Revisa mis webs ahora y dime qué ves
                  </button>
                  @for (s of agent().sugerencias; track s) {
                    <button type="button" class="sug" (click)="send(s)">{{ s }}</button>
                  }
                </div>
              </div>
            }

            @for (m of messages(); track m.id) {
              @switch (m.rol) {
                @case ('yo') {
                  <div class="me-row"><p class="me">{{ m.texto }}</p></div>
                }
                @case ('nota') {
                  <div class="nota">
                    <p class="nota-h">
                      <ion-icon name="swap-horizontal-outline" aria-hidden="true" />
                      <span><strong>{{ nameOf(m.traspaso!.de) }}</strong> te ha pasado: {{ m.traspaso!.titulo }}</span>
                    </p>
                    <p class="nota-t">{{ notaBody(m.texto) }}</p>
                    <button type="button" class="link" (click)="pick(m.traspaso!.de)">Ver el chat de {{ nameOf(m.traspaso!.de) }}</button>
                  </div>
                }
                @default {
                  <article class="bot" [class.aviso]="m.aviso">
                    <div class="bot-h">
                      <app-agent-avatar [agent]="agent()" [size]="26" [showBadge]="false" />
                      <span class="bot-n">{{ agent().nombre }}</span>
                      @if (m.aviso) { <span class="tag">Aviso{{ m.aviso.siteId ? ' · ' + siteName(m.aviso.siteId) : '' }}</span> }
                      @if (m.createdAt) { <span class="small muted when">{{ ago(m.createdAt) }}</span> }
                    </div>
                    @if (m.aviso) { <p class="av-t">{{ m.aviso.titulo }}</p> }
                    <div class="rich">
                      @for (b of blocks(m.texto); track $index) {
                        @if (b.list) {
                          <ul>
                            @for (li of b.items; track $index) {
                              <li>@for (s of li; track $index) {@if (s.b) {<strong>{{ s.t }}</strong>} @else {{{ s.t }}}}</li>
                            }
                          </ul>
                        } @else {
                          @for (line of b.items; track $index) {
                            <p>@for (s of line; track $index) {@if (s.b) {<strong>{{ s.t }}</strong>} @else {{{ s.t }}}}</p>
                          }
                        }
                      }
                    </div>

                    @for (pr of m.propuestas ?? []; track pr.id) {
                      <div class="att">
                        <ion-icon name="bulb-outline" aria-hidden="true" />
                        <span class="att-t">Propuesta: {{ pr.titulo }}</span>
                        <button type="button" class="mini" (click)="router.navigate(['/propuestas'])">Ver</button>
                        <button type="button" class="mini" (click)="togglePass(m.id + pr.id)">Pasar a…</button>
                      </div>
                      @if (passOpen() === m.id + pr.id) {
                        <div class="pass" role="group" aria-label="Pasar la propuesta a otro agente">
                          @for (o of others(); track o.id) {
                            <button type="button" class="chip" (click)="passTo(o, 'la propuesta «' + pr.titulo + '» (id ' + pr.id + ')')">
                              <app-agent-avatar [agent]="o" [size]="22" [showBadge]="false" /> {{ o.nombre }}
                            </button>
                          }
                        </div>
                      }
                    }

                    @for (t of m.traspasos ?? []; track t.agente + t.titulo) {
                      <button type="button" class="att go" (click)="pick(t.agente)">
                        <ion-icon name="swap-horizontal-outline" aria-hidden="true" />
                        <span class="att-t">Pasado a {{ nameOf(t.agente) }}: {{ t.titulo }}</span>
                        <ion-icon name="chevron-forward-outline" aria-hidden="true" />
                      </button>
                    }

                    @if (m.aviso) {
                      <div class="quick">
                        <button type="button" class="chip" (click)="send('Sobre tu aviso «' + m.aviso.titulo + '»: ¿qué propones exactamente y qué tengo que hacer yo?')">¿Qué propones?</button>
                        <button type="button" class="chip" (click)="send('Sobre tu aviso «' + m.aviso.titulo + '»: adelante, prepáralo y crea la propuesta.')">Adelante, prepáralo</button>
                        <button type="button" class="chip" (click)="togglePass(m.id)">Pasar a…</button>
                      </div>
                      @if (passOpen() === m.id) {
                        <div class="pass" role="group" aria-label="Pasar el aviso a otro agente">
                          @for (o of others(); track o.id) {
                            <button type="button" class="chip" (click)="passTo(o, 'tu aviso «' + m.aviso.titulo + '»')">
                              <app-agent-avatar [agent]="o" [size]="22" [showBadge]="false" /> {{ o.nombre }}
                            </button>
                          }
                        </div>
                      }
                    }
                  </article>
                }
              }
            }

            @if (isBusy(selected())) {
              <div class="bot typing" role="status">
                <div class="bot-h">
                  <app-agent-avatar [agent]="agent()" [size]="26" [showBadge]="false" />
                  <span class="bot-n">{{ agent().nombre }}</span>
                </div>
                <div class="dots"><span></span><span></span><span></span></div>
                <span class="sr-only">{{ agent().nombre }} está escribiendo…</span>
              </div>
            }
            @if (data.chatError(); as err) {
              <p class="err" role="alert">{{ err }}</p>
            }
          </div>
        </div>

        <footer class="bottom">
          @if (messages().length) {
            <div class="sugs" aria-label="Preguntas rápidas">
              <button type="button" class="chip" (click)="reviewOne()" [disabled]="isBusy(selected())">
                <ion-icon name="sparkles-outline" aria-hidden="true" /> Revisa ahora
              </button>
              @for (s of agent().sugerencias; track s) {
                <button type="button" class="chip" (click)="send(s)">{{ s }}</button>
              }
            </div>
          }
          <form class="composer" (submit)="$event.preventDefault(); send(text())">
            <label for="msg" class="sr-only">Escribe al agente de {{ agent().nombre }}</label>
            <textarea id="msg" #box rows="1" [value]="text()" (input)="onInput($event)" (keydown)="onKey($event)"
                      [placeholder]="'Escribe a ' + agent().nombre + '…'"></textarea>
            <button type="submit" class="send" aria-label="Enviar" [disabled]="!text().trim() || isBusy(selected())">
              <ion-icon name="arrow-up-outline" aria-hidden="true" />
            </button>
          </form>
        </footer>
      </section>
    </div>
  `,
  styles: `
    :host { display: block; height: 100%; }
    .shell { position: relative; display: flex; height: 100%; overflow: hidden; background: var(--bg); }

    /* ---------- Lista lateral ---------- */
    .side {
      flex: none; width: 300px; display: flex; flex-direction: column; background: var(--card);
      border-right: 1px solid var(--border); z-index: 3;
    }
    .side-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 16px 8px; }
    .side-head h1 { margin: 0; font-family: var(--font-title); font-size: 20px; }
    .list { list-style: none; margin: 0; padding: 4px 8px; overflow-y: auto; flex: 1; }
    .item {
      width: 100%; display: flex; align-items: center; gap: 12px; padding: 10px; border: 0; border-radius: 14px;
      background: none; text-align: left; cursor: pointer; min-height: 64px;
    }
    .item:hover { background: var(--track); }
    .item.on { background: color-mix(in srgb, var(--agent) 12%, var(--card)); }
    .it-txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .it-top { display: flex; justify-content: space-between; gap: 8px; }
    .it-top strong { font-size: 14px; }
    .it-time { font-size: 11px; color: var(--muted); flex: none; }
    .it-sub { font-size: 12.5px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .it-sub.unread { color: var(--text); font-weight: 600; }
    .typing-txt { color: var(--up) !important; font-style: italic; }
    .side-foot { margin: 0; padding: 12px 16px 16px; line-height: 1.4; }
    .backdrop { display: none; }
    .rev { padding: 4px 12px 8px; }
    .rev-btn {
      width: 100%; min-height: 48px; display: flex; align-items: center; justify-content: center; gap: 8px;
      border: 0; border-radius: 14px; background: var(--sel-bg); color: var(--sel-text); font-weight: 700; font-size: 14px; cursor: pointer;
    }
    .rev-btn:disabled { opacity: 0.7; cursor: default; }
    .rev-btn ion-icon, .sug.strong ion-icon, .chip ion-icon { font-size: 17px; }
    .rev-form { display: flex; flex-direction: column; gap: 6px; padding: 10px; border-radius: 14px; background: var(--track); }
    .rev-form label { font-size: 13px; font-weight: 700; }
    .rev-form textarea {
      width: 100%; min-height: 60px; padding: 8px 10px; border-radius: 10px; border: 1px solid var(--border);
      background: var(--card); color: var(--text); font: inherit; font-size: 14px; resize: vertical;
    }
    .rev-row { display: flex; justify-content: flex-end; gap: 6px; }
    .mini.solid { display: inline-flex; align-items: center; gap: 6px; background: var(--sel-bg); color: var(--sel-text); border-color: var(--sel-bg); }
    .rev-msg { margin: 8px 2px 0; line-height: 1.4; color: var(--muted); }
    .sug.strong { display: flex; align-items: center; gap: 8px; font-weight: 700; border-color: var(--agent); }
    @media (min-width: 600px) { .sug.strong { grid-column: 1 / -1; } }

    /* ---------- Conversación ---------- */
    .main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .top {
      display: flex; align-items: center; gap: 10px; padding: 10px 12px; min-height: 60px;
      border-bottom: 1px solid var(--border); background: var(--card);
    }
    .who { flex: 1; min-width: 0; }
    .who p { margin: 0; }
    .name { font-weight: 700; font-size: 15px; }
    .status { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ic {
      position: relative; flex: none; width: 44px; height: 44px; border-radius: 12px; border: 0; background: none;
      display: grid; place-items: center; font-size: 22px; color: var(--text); cursor: pointer;
    }
    .ic:hover { background: var(--track); }
    .ic:disabled { opacity: 0.4; }
    .mdot { position: absolute; top: 9px; right: 8px; width: 10px; height: 10px; border-radius: 50%; background: var(--badge); border: 2px solid var(--card); }

    .scroll { flex: 1; overflow-y: auto; overscroll-behavior: contain; }
    .thread { max-width: 760px; margin: 0 auto; padding: 20px 16px 12px; display: flex; flex-direction: column; gap: 18px; }

    .hello { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 6px; padding: 24px 8px; }
    .hello h2 { margin: 8px 0 0; font-family: var(--font-title); font-size: 22px; }
    .hello p { margin: 0; max-width: 420px; line-height: 1.5; }
    .sug-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; width: 100%; max-width: 460px; margin-top: 16px; }
    @media (min-width: 600px) { .sug-grid { grid-template-columns: 1fr 1fr; } }
    .sug {
      min-height: 52px; padding: 10px 14px; border-radius: 14px; border: 1px solid var(--border); background: var(--card);
      text-align: left; font-size: 13.5px; line-height: 1.35; cursor: pointer;
    }
    .sug:hover { border-color: var(--agent); }

    .me-row { display: flex; justify-content: flex-end; }
    .me {
      max-width: 82%; margin: 0; padding: 10px 14px; border-radius: 18px 18px 4px 18px;
      background: var(--sel-bg); color: var(--sel-text); line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere;
    }

    .bot { display: flex; flex-direction: column; gap: 6px; }
    .bot-h { display: flex; align-items: center; gap: 8px; }
    .bot-n { font-weight: 700; font-size: 13px; }
    .when { margin-left: auto; }
    .tag { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 10px; background: var(--soft-orange); color: var(--obralocal); }
    .rich { line-height: 1.6; font-size: 14.5px; overflow-wrap: anywhere; }
    .rich p { margin: 0 0 8px; }
    .rich p:last-child { margin-bottom: 0; }
    .rich ul { margin: 0 0 8px; padding-left: 20px; }
    .rich li { margin: 2px 0; }
    .aviso {
      padding: 14px; border-radius: 16px; background: var(--card); border: 1px solid var(--border);
      border-left: 4px solid var(--agent);
    }
    .av-t { margin: 2px 0 0; font-weight: 700; font-size: 15px; line-height: 1.35; }

    .att {
      display: flex; align-items: center; gap: 8px; padding: 8px 8px 8px 12px; border-radius: 12px;
      border: 1px solid var(--border); background: var(--card); font-size: 13px; min-height: 48px;
    }
    .att ion-icon { flex: none; font-size: 18px; color: var(--agent); }
    .att-t { flex: 1; min-width: 0; font-weight: 600; }
    .att.go { width: 100%; text-align: left; cursor: pointer; color: var(--text); }
    .mini {
      flex: none; min-height: 36px; padding: 0 10px; border-radius: 10px; border: 1px solid var(--border);
      background: var(--bg); font-size: 12px; font-weight: 600; cursor: pointer;
    }
    .quick, .pass { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
    .chip {
      display: inline-flex; align-items: center; gap: 6px; min-height: 40px; padding: 0 12px; border-radius: 20px;
      border: 1px solid var(--border); background: var(--card); font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap;
    }
    .chip:hover { border-color: var(--agent); }
    .pass { padding: 8px; border-radius: 14px; background: var(--track); }

    .nota {
      align-self: center; width: 100%; max-width: 560px; padding: 12px 14px; border-radius: 16px;
      background: color-mix(in srgb, var(--agent) 10%, var(--card)); border: 1px dashed color-mix(in srgb, var(--agent) 45%, var(--border));
    }
    .nota p { margin: 0; }
    .nota-h { display: flex; gap: 8px; align-items: flex-start; font-size: 13.5px; line-height: 1.4; }
    .nota-h ion-icon { flex: none; font-size: 18px; color: var(--agent); margin-top: 1px; }
    .nota-t { margin-top: 6px !important; font-size: 13px; color: var(--muted); line-height: 1.5; white-space: pre-wrap; }
    .link { margin-top: 6px; min-height: 36px; padding: 0; border: 0; background: none; font-size: 13px; font-weight: 700; color: var(--text); text-decoration: underline; cursor: pointer; }

    .typing .dots { display: flex; gap: 5px; padding: 6px 0 2px 34px; }
    .typing .dots span { width: 8px; height: 8px; border-radius: 50%; background: var(--agent); animation: blink 1.2s infinite; }
    .typing .dots span:nth-child(2) { animation-delay: 0.2s; }
    .typing .dots span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes blink { 0%, 80%, 100% { opacity: 0.25; } 40% { opacity: 1; } }
    .err { margin: 0; color: var(--down); font-size: 14px; }

    .bottom { padding: 8px 12px 12px; background: linear-gradient(to top, var(--bg) 70%, transparent); }
    .sugs { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; max-width: 760px; margin: 0 auto 8px; }
    .sugs::-webkit-scrollbar { display: none; }
    .composer {
      max-width: 760px; margin: 0 auto; display: flex; align-items: flex-end; gap: 8px; padding: 8px 8px 8px 16px;
      border: 1px solid var(--border); border-radius: 24px; background: var(--card); box-shadow: 0 4px 18px rgb(0 0 0 / 0.06);
    }
    .composer:focus-within { border-color: var(--agent); }
    textarea {
      flex: 1; min-width: 0; min-height: 40px; max-height: 160px; padding: 9px 0; border: 0; resize: none;
      background: transparent; color: var(--text); font: inherit; font-size: 15px; line-height: 1.45; outline: none;
    }
    textarea::placeholder { color: var(--muted); }
    .send {
      flex: none; width: 40px; height: 40px; border-radius: 50%; border: 0; background: var(--agent); color: #fff;
      display: grid; place-items: center; font-size: 20px; cursor: pointer;
    }
    .send:disabled { opacity: 0.35; cursor: default; }

    /* ---------- Móvil: la lista es un cajón que sale por la izquierda ---------- */
    @media (max-width: 1099px) {
      .side {
        position: absolute; inset: 0 auto 0 0; width: min(320px, 86%); transform: translateX(-102%);
        transition: transform 0.28s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.28s ease;
      }
      .open .side { transform: none; box-shadow: 8px 0 30px rgb(0 0 0 / 0.18); }
      .backdrop {
        display: block; position: absolute; inset: 0; z-index: 2; border: 0; padding: 0; background: rgb(0 0 0 / 0.35);
        opacity: 0; pointer-events: none; transition: opacity 0.28s ease;
      }
      .open .backdrop { opacity: 1; pointer-events: auto; }
    }
    @media (min-width: 1100px) { .only-m { display: none; } }
    @media (prefers-reduced-motion: reduce) { .side, .backdrop { transition: none; } }
  `,
})
export class AgentesPage {
  protected readonly data = inject(DataService);
  protected readonly router = inject(Router);
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  private readonly box = viewChild<ElementRef<HTMLTextAreaElement>>('box');

  /** ?a=desarrollo para abrir un agente concreto */
  readonly a = input<AgentId | undefined>();
  protected readonly selected = signal<AgentId>('seo');
  protected readonly agent = computed<Agent>(() => this.data.agent(this.selected()));
  protected readonly messages = computed(() => this.data.messages(this.selected()));
  protected readonly others = computed(() => this.data.agents.filter((x) => x.id !== this.selected()));
  protected readonly otherUnread = computed(() => this.data.agents.some((x) => x.id !== this.selected() && x.avisos > 0));
  protected readonly text = signal('');
  protected readonly drawer = signal(false);
  protected readonly passOpen = signal<string | null>(null);
  /** ?revisar=1 abre directamente el formulario de revisión del equipo */
  readonly revisar = input<string | undefined>();
  protected readonly reviewOpen = signal(false);
  protected readonly foco = signal('');
  protected readonly reviewMsg = signal<string | null>(null);

  protected startReview(): void {
    const foco = this.foco().trim();
    this.reviewOpen.set(false);
    this.foco.set('');
    this.reviewMsg.set('Los 5 agentes están revisando tus webs. Cada uno te escribirá en su chat; verás su globito.');
    void this.data.reviewAll(foco).then((err) =>
      this.reviewMsg.set(err ? `Alguno no pudo terminar: ${err}` : 'Listo: tu equipo te ha escrito. Mira los globitos.'));
  }

  protected reviewOne(): void {
    void this.data.reviewAgent(this.selected());
  }
  protected readonly ago = timeAgo;

  constructor() {
    // Abrir el agente pedido o, si no, el primero con mensajes sin leer.
    effect(() => {
      const a = this.a();
      untracked(() => {
        if (a && this.data.agents.some((x) => x.id === a)) this.selected.set(a);
        else {
          const unread = this.data.agents.find((x) => x.avisos > 0);
          if (unread) this.selected.set(unread.id);
        }
      });
    });
    effect(() => {
      const id = this.selected();
      untracked(() => {
        void this.data.loadChat(id);
        void this.data.markAgentRead(id);
        this.passOpen.set(null);
      });
    });
    void this.data.loadChatPreviews();
    effect(() => {
      if (this.revisar()) {
        untracked(() => {
          this.drawer.set(true);
          this.reviewOpen.set(true);
        });
      }
    });
    // Bajar al último mensaje cuando llega algo nuevo.
    effect(() => {
      this.messages().length;
      this.isBusy(this.selected());
      this.selected();
      queueMicrotask(() => setTimeout(() => this.toBottom(), 30));
    });
  }

  protected isBusy(id: AgentId): boolean {
    return this.data.thinking() === id || this.data.working().includes(id);
  }

  protected pick(id: AgentId): void {
    this.selected.set(id);
    this.drawer.set(false);
    void this.router.navigate([], { queryParams: { a: id }, replaceUrl: true });
  }

  protected nameOf(id: AgentId): string {
    return this.data.agent(id)?.nombre ?? id;
  }

  protected siteName(id: string): string {
    return this.data.sites.find((s) => s.id === id)?.nombre ?? id;
  }

  protected preview(t: string): string {
    return t.replace(/\*\*/g, '').replace(/\s+/g, ' ').slice(0, 80);
  }

  /** Quita la primera línea («X te ha pasado: …») porque ya se muestra como título. */
  protected notaBody(t: string): string {
    return t.split('\n').slice(1).join('\n').trim();
  }

  /** Texto del agente en párrafos y listas, con **negrita**. */
  protected blocks(t: string): Block[] {
    const segs = (s: string) => s.split('**').map((x, i) => ({ t: x, b: i % 2 === 1 }));
    const out: Block[] = [];
    for (const raw of t.split(/\n/)) {
      const line = raw.trim();
      const last = out.at(-1);
      if (!line) {
        if (last && !last.list) out.push({ list: false, items: [] });
        continue;
      }
      const m = /^([-•*]|\d+[.)])\s+(.*)$/.exec(line);
      if (m) {
        if (last?.list) last.items.push(segs(m[2]));
        else out.push({ list: true, items: [segs(m[2])] });
      } else if (last && !last.list && last.items.length) {
        last.items.push(segs(line));
      } else if (last && !last.list) {
        last.items.push(segs(line));
      } else {
        out.push({ list: false, items: [segs(line)] });
      }
    }
    return out.filter((b) => b.items.length);
  }

  protected togglePass(key: string): void {
    this.passOpen.set(this.passOpen() === key ? null : key);
  }

  protected passTo(o: Agent, what: string): void {
    this.passOpen.set(null);
    this.send(`Pásale ${what} a ${o.nombre} para que siga trabajando con ello.`);
  }

  protected onInput(e: Event): void {
    const el = e.target as HTMLTextAreaElement;
    this.text.set(el.value);
    this.autosize(el);
  }

  protected onKey(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      this.send(this.text());
    }
  }

  protected send(t: string): void {
    const msg = t.trim();
    if (!msg || this.isBusy(this.selected())) return;
    void this.data.send(this.selected(), msg);
    this.text.set('');
    const el = this.box()?.nativeElement;
    if (el) {
      el.value = '';
      this.autosize(el);
    }
  }

  private autosize(el: HTMLTextAreaElement): void {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  private toBottom(): void {
    const el = this.scroller()?.nativeElement;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }

  /** Para la plantilla: tipo explícito en los mensajes del @switch */
  protected asMsg(m: ChatMessage): ChatMessage {
    return m;
  }
}
