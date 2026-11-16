import { Component, ElementRef, HostListener, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { DataService } from '../core/data.service';
import { timeAgo } from '../core/format';
import { AgentAvatar } from './agent-avatar';
import { AppLogo } from './app-logo';
import { ThemeToggle } from './theme-toggle';

@Component({
  selector: 'app-page-header',
  imports: [IonIcon, ThemeToggle, AppLogo, AgentAvatar],
  template: `
    <header class="head">
      @if (logo()) {
        <app-logo class="logo" [size]="44" />
      }
      <div class="titles">
        <p class="kicker">{{ kicker() }}</p>
        <h1>{{ title() }}</h1>
      </div>
      <div class="actions">
        <button type="button" class="round" (click)="refresh()" [disabled]="data.refreshing()"
                [attr.aria-label]="data.refreshing() ? 'Actualizando datos' : 'Actualizar datos ahora'" title="Actualizar ahora">
          <ion-icon name="refresh-outline" aria-hidden="true" [class.spin]="data.refreshing()" />
        </button>
        <app-theme-toggle />
        <button type="button" class="round" (click)="toggle()" [attr.aria-expanded]="open()"
                [attr.aria-label]="'Avisos: ' + data.notifications() + ' sin leer'">
          <ion-icon name="notifications-outline" aria-hidden="true" />
          @if (data.notifications() > 0) {
            <span class="badge" aria-hidden="true">{{ data.notifications() }}</span>
          }
        </button>
      </div>

      @if (msg()) {
        <p class="toast" role="status">{{ msg() }}</p>
      }

      @if (open()) {
        <section class="panel card" role="dialog" aria-label="Avisos">
          <div class="p-head">
            <h2 class="card-title">Avisos</h2>
            @if (data.unreadAvisos()) {
              <button type="button" class="btn-link small" (click)="data.markAvisosRead()">Marcar todo como leído</button>
            }
          </div>

          <div class="push">
            @switch (data.push()) {
              @case ('activado') {
                <p class="small"><span class="dot ok"></span>Avisos activados en este dispositivo.</p>
                <div class="row">
                  <button type="button" class="btn small-btn" (click)="test()" [disabled]="busy()">Enviar prueba</button>
                  <button type="button" class="btn-link small" (click)="data.disablePush()">Desactivar</button>
                </div>
              }
              @case ('bloqueado') {
                <p class="small">Bloqueaste las notificaciones. Actívalas en los ajustes del navegador para esta web y recarga.</p>
              }
              @case ('no_soportado') {
                <p class="small">Este navegador no admite notificaciones. En iPhone: Compartir → «Añadir a pantalla de inicio» y abre Webby desde ese icono.</p>
              }
              @default {
                <p class="small">Recibe cada mañana en el móvil lo que te cuenta tu equipo.</p>
                <button type="button" class="btn btn-solid wide" (click)="enable()" [disabled]="busy()">
                  {{ busy() ? 'Activando…' : 'Activar avisos en este móvil' }}
                </button>
              }
            }
          </div>

          @if (data.pendingCount()) {
            <button type="button" class="item pend" (click)="go('/propuestas')">
              <ion-icon name="git-branch-outline" aria-hidden="true" />
              <span><strong>{{ data.pendingCount() }} {{ data.pendingCount() === 1 ? 'propuesta espera' : 'propuestas esperan' }} tu respuesta</strong></span>
            </button>
          }

          <ul class="list">
            @for (a of data.avisos(); track a.id) {
              <li>
                <button type="button" class="item" [class.unread]="!a.leido" (click)="openAviso(a.id, a.enlace)">
                  @if (a.agentId) {
                    <app-agent-avatar [agent]="data.agent(a.agentId)" [size]="32" [showBadge]="false" />
                  }
                  <span class="txt">
                    <strong>{{ a.titulo }}</strong>
                    <span class="small">{{ a.texto }}</span>
                    <span class="small muted">{{ a.agentId ? data.agent(a.agentId).nombre + ' · ' : '' }}{{ ago(a.createdAt) }}</span>
                  </span>
                </button>
              </li>
            } @empty {
              <li class="small muted empty">Aún no hay avisos. Tu equipo revisa tus webs cada mañana a las 7:00.</li>
            }
          </ul>

          <button type="button" class="btn wide" (click)="runAgents()" [disabled]="running()">
            {{ running() ? 'Tu equipo está revisando… (1 minuto)' : 'Pedir una revisión ahora' }}
          </button>
        </section>
      }
    </header>
  `,
  styles: `
    .head {
      position: relative; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
      padding: 16px var(--gutter) 8px; max-width: 1200px; margin: 0 auto;
    }
    .logo { margin-top: 2px; }
    .titles { flex: 1; min-width: 0; }
    @media (min-width: 960px) { .logo { display: none; } }
    .kicker { margin: 0 0 2px; font-size: 13px; color: var(--muted); }
    h1 { margin: 0; font-family: var(--font-title); font-size: 24px; font-weight: 700; letter-spacing: -0.01em; }
    .actions { display: flex; gap: 8px; }
    .round {
      position: relative; width: 44px; height: 44px; border-radius: 50%;
      border: 1px solid var(--border); background: var(--card); color: var(--text);
      display: grid; place-items: center; cursor: pointer; font-size: 20px;
    }
    .round:disabled { cursor: default; }
    .spin { animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .badge {
      position: absolute; top: -2px; right: -2px; min-width: 18px; height: 18px; padding: 0 5px;
      border-radius: 9px; background: var(--badge); color: #fff;
      font-size: 11px; font-weight: 700; line-height: 18px; text-align: center;
    }
    .toast {
      position: absolute; right: var(--gutter); top: 66px; z-index: 31; margin: 0; max-width: min(360px, calc(100vw - 32px));
      padding: 10px 14px; border-radius: 12px; background: var(--sel-bg); color: var(--sel-text); font-size: 13px;
      box-shadow: 0 6px 24px rgb(0 0 0 / 0.18);
    }
    .panel {
      position: absolute; right: var(--gutter); top: 66px; z-index: 30;
      width: min(400px, calc(100vw - 32px)); max-height: min(70vh, 640px); overflow-y: auto;
      display: flex; flex-direction: column; gap: 12px; box-shadow: 0 12px 40px rgb(0 0 0 / 0.22);
    }
    .p-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .push { padding: 12px; border-radius: 12px; background: var(--track); }
    .push p { margin: 0 0 8px; line-height: 1.45; }
    .push .row { display: flex; align-items: center; gap: 12px; }
    .small-btn { height: 36px; padding: 0 12px; font-size: 13px; }
    .dot.ok { display: inline-block; width: 8px; height: 8px; margin-right: 6px; border-radius: 50%; background: var(--live); }
    .list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
    .item {
      width: 100%; display: flex; gap: 10px; align-items: flex-start; text-align: left; padding: 10px;
      border: 0; border-radius: 12px; background: none; color: var(--text); cursor: pointer; font: inherit;
    }
    .item:hover { background: var(--track); }
    .item.unread { background: color-mix(in srgb, var(--badge) 8%, var(--card)); }
    .item.pend { background: var(--soft-orange); align-items: center; }
    .txt { display: flex; flex-direction: column; gap: 2px; min-width: 0; line-height: 1.4; }
    .empty { padding: 8px 4px; line-height: 1.45; }
  `,
})
export class PageHeader {
  readonly kicker = input('');
  readonly title = input.required<string>();
  /** Muestra el logo a la izquierda (solo en móvil; en escritorio va en el menú). */
  readonly logo = input(false);
  protected readonly data = inject(DataService);
  private readonly router = inject(Router);
  private readonly host = inject(ElementRef<HTMLElement>);

  protected readonly open = signal(false);
  protected readonly busy = signal(false);
  protected readonly running = signal(false);
  protected readonly msg = signal<string | null>(null);
  private msgTimer?: ReturnType<typeof setTimeout>;
  protected readonly ago = timeAgo;

  @HostListener('document:click', ['$event'])
  protected outside(ev: Event): void {
    if (this.open() && !this.host.nativeElement.contains(ev.target as Node)) this.open.set(false);
  }

  protected toggle(): void {
    this.open.update((v) => !v);
  }

  private say(text: string): void {
    this.msg.set(text);
    clearTimeout(this.msgTimer);
    this.msgTimer = setTimeout(() => this.msg.set(null), 5000);
  }

  protected async refresh(): Promise<void> {
    const err = await this.data.refreshAll();
    this.say(err ?? 'Datos actualizados.');
  }

  protected async enable(): Promise<void> {
    this.busy.set(true);
    const err = await this.data.enablePush();
    this.busy.set(false);
    if (err) this.say(err);
    else await this.test();
  }

  protected async test(): Promise<void> {
    this.busy.set(true);
    const err = await this.data.testPush();
    this.busy.set(false);
    this.say(err ?? 'Prueba enviada: te debería llegar en unos segundos.');
  }

  protected async runAgents(): Promise<void> {
    this.running.set(true);
    const err = await this.data.runAgentsNow();
    this.running.set(false);
    this.say(err ?? 'Tu equipo ha revisado tus webs.');
  }

  protected openAviso(id: string, enlace: string | null): void {
    void this.data.markAvisosRead([id]);
    if (enlace) this.go(enlace);
  }

  protected go(url: string): void {
    this.open.set(false);
    void this.router.navigateByUrl(url);
  }
}
