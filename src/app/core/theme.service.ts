import { Injectable, computed, signal } from '@angular/core';

type Theme = 'light' | 'dark';
const KEY = 'webby-theme';

/**
 * Tema claro/oscuro. Por defecto sigue al sistema; si Luis pulsa el botón,
 * se guarda su elección y se marca en <html data-theme="...">.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly media = window.matchMedia('(prefers-color-scheme: dark)');
  private readonly systemDark = signal(this.media.matches);
  private readonly chosen = signal<Theme | null>(this.read());

  readonly theme = computed<Theme>(
    () => this.chosen() ?? (this.systemDark() ? 'dark' : 'light'),
  );
  readonly isDark = computed(() => this.theme() === 'dark');

  constructor() {
    this.media.addEventListener('change', (e) => this.systemDark.set(e.matches));
  }

  toggle(): void {
    const next: Theme = this.isDark() ? 'light' : 'dark';
    this.chosen.set(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* sin almacenamiento: se aplica solo en esta sesión */
    }
  }

  private read(): Theme | null {
    try {
      const v = localStorage.getItem(KEY);
      return v === 'light' || v === 'dark' ? v : null;
    } catch {
      return null;
    }
  }
}
