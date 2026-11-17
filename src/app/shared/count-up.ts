import { Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { fmt } from '../core/format';

const reduceMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Número que "cuenta" hasta su valor cuando aparece o cambia. */
@Component({
  selector: 'app-count',
  template: `{{ text() }}`,
  styles: `:host { font-variant-numeric: tabular-nums; }`,
})
export class CountUp {
  readonly value = input.required<number>();
  readonly format = input<(n: number) => string>((n) => fmt(Math.round(n)));
  readonly duration = input(800);

  private readonly shown = signal(0);
  protected readonly text = computed(() => this.format()(this.shown()));
  private frame = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => cancelAnimationFrame(this.frame));
    effect(() => {
      const to = this.value();
      untracked(() => this.animate(to));
    });
  }

  private animate(to: number): void {
    cancelAnimationFrame(this.frame);
    if (reduceMotion() || !Number.isFinite(to)) {
      this.shown.set(to);
      return;
    }
    const from = this.shown();
    const start = performance.now();
    const dur = this.duration();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - t, 3);
      this.shown.set(from + (to - from) * e);
      if (t < 1) this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  }
}
