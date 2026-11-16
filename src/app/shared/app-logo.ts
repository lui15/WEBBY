import { Component, input } from '@angular/core';

/** Logo de Webby: una W que sube como una gráfica, con un punto por cada web. */
@Component({
  selector: 'app-logo',
  template: `
    <svg viewBox="0 0 512 512" [attr.width]="size()" [attr.height]="size()" role="img" aria-label="Webby">
      <rect width="512" height="512" rx="116" fill="#15171C" />
      <polyline points="106,170 184,326 256,214 328,326 406,170" fill="none" stroke="#FFFFFF"
                stroke-width="44" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="184" cy="326" r="40" fill="#FB923C" />
      <circle cx="328" cy="326" r="40" fill="#60A5FA" />
      <circle cx="406" cy="170" r="40" fill="#34D399" />
    </svg>
  `,
  styles: `
    :host { display: inline-flex; flex: none; }
    svg { display: block; border-radius: 22.6%; box-shadow: 0 0 0 1px var(--border); }
  `,
})
export class AppLogo {
  readonly size = input(32);
}
