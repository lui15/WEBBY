import { Component, computed, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { Agent } from '../core/models';

/** Avatar circular con el icono del agente; anillo y globito si tiene avisos o está seleccionado. */
@Component({
  selector: 'app-agent-avatar',
  imports: [IonIcon],
  template: `
    <span
      class="av"
      [class.ring]="ringed()"
      [style.--c]="agent().color"
      [style.width.px]="size()"
      [style.height.px]="size()"
      [style.font-size.px]="size() * 0.46"
    >
      <ion-icon [name]="agent().icon" aria-hidden="true" />
      @if (showBadge() && agent().avisos > 0) {
        <span class="badge" aria-hidden="true">{{ agent().avisos }}</span>
      }
    </span>
  `,
  styles: `
    :host { display: inline-flex; flex: none; }
    .av {
      position: relative; display: grid; place-items: center; border-radius: 50%;
      background: var(--c); color: #fff; --ionicon-stroke-width: 44px;
    }
    .ring { box-shadow: 0 0 0 2px var(--card), 0 0 0 4px var(--c); }
    .badge {
      position: absolute; top: -4px; right: -4px; min-width: 18px; height: 18px; padding: 0 5px;
      border-radius: 9px; background: var(--badge); color: #fff; border: 2px solid var(--card);
      font-family: var(--font-body); font-size: 10px; font-weight: 700; line-height: 14px; text-align: center;
    }
  `,
})
export class AgentAvatar {
  readonly agent = input.required<Agent>();
  readonly size = input(44);
  readonly selected = input(false);
  readonly showBadge = input(true);
  protected readonly ringed = computed(
    () => this.selected() || (this.showBadge() && this.agent().avisos > 0),
  );
}
