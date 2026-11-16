import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { IonApp, IonIcon, IonRouterOutlet } from '@ionic/angular';
import { DataService } from './core/data.service';
import { SupabaseService } from './core/supabase.service';
import { AppLogo } from './shared/app-logo';

interface Tab {
  path: string;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-root',
  imports: [IonApp, IonRouterOutlet, IonIcon, RouterLink, RouterLinkActive, AppLogo],
  template: `
    <ion-app>
      @if (sb.session()) {
      <nav class="nav" aria-label="Secciones">
        <p class="brand"><app-logo [size]="36" /><span class="num">Webby</span></p>
        @for (t of tabs; track t.path) {
          <a
            class="tab"
            [routerLink]="t.path"
            routerLinkActive="active"
            #rla="routerLinkActive"
            [attr.aria-current]="rla.isActive ? 'page' : null"
          >
            <span class="ico">
              <ion-icon [name]="t.icon" aria-hidden="true" />
              @if (t.path === '/propuestas' && data.pendingCount() > 0) {
                <span class="dot-red"></span>
                <span class="sr-only">({{ data.pendingCount() }} pendientes)</span>
              }
            </span>
            <span class="txt">{{ t.label }}</span>
          </a>
        }
      </nav>
      }
      <div class="main">
        <ion-router-outlet />
      </div>
    </ion-app>
  `,
  styles: `
    ion-app { flex-direction: column; }
    .main { position: relative; flex: 1; min-height: 0; }
    .nav {
      order: 2; display: flex; justify-content: space-around;
      background: var(--nav); border-top: 1px solid var(--border);
      padding: 4px 4px calc(4px + env(safe-area-inset-bottom));
    }
    .brand { display: none; }
    .tab {
      flex: 1; min-height: 56px; display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 3px; color: var(--muted); text-decoration: none; font-size: 11px; font-weight: 500; border-radius: 12px;
    }
    .tab.active { color: var(--text); font-weight: 700; }
    .ico { position: relative; font-size: 22px; display: grid; }
    .dot-red {
      position: absolute; top: -1px; right: -3px; width: 9px; height: 9px; border-radius: 50%;
      background: var(--badge); border: 2px solid var(--nav);
    }

    @media (min-width: 960px) {
      ion-app { flex-direction: row; }
      .nav {
        order: 0; flex-direction: column; justify-content: flex-start; gap: 4px;
        width: 232px; padding: 20px 12px; border-top: 0; border-right: 1px solid var(--border);
      }
      .brand { display: flex; align-items: center; gap: 10px; margin: 0 12px 20px; font-size: 22px; }
      .tab { flex: none; flex-direction: row; justify-content: flex-start; gap: 12px; min-height: 48px; padding: 0 12px; font-size: 14px; }
      .tab.active { background: var(--track); }
    }
  `,
})
export class App {
  protected readonly data = inject(DataService);
  protected readonly sb = inject(SupabaseService);
  protected readonly tabs: Tab[] = [
    { path: '/inicio', label: 'Inicio', icon: 'home-outline' },
    { path: '/webs', label: 'Webs', icon: 'bar-chart-outline' },
    { path: '/agentes', label: 'Agentes', icon: 'people-outline' },
    { path: '/propuestas', label: 'Propuestas', icon: 'bulb-outline' },
    { path: '/informes', label: 'Informes', icon: 'document-text-outline' },
  ];
}
