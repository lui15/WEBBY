import { Component, inject } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { ThemeService } from '../core/theme.service';

@Component({
  selector: 'app-theme-toggle',
  imports: [IonIcon],
  template: `
    <button
      type="button"
      class="round"
      (click)="theme.toggle()"
      [attr.aria-label]="theme.isDark() ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'"
    >
      <ion-icon [name]="theme.isDark() ? 'sunny-outline' : 'moon-outline'" aria-hidden="true" />
    </button>
  `,
  styles: `
    .round {
      width: 44px; height: 44px; border-radius: 50%;
      border: 1px solid var(--border); background: var(--card);
      display: grid; place-items: center; cursor: pointer; font-size: 20px;
    }
  `,
})
export class ThemeToggle {
  protected readonly theme = inject(ThemeService);
}
