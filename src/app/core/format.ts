const nf = new Intl.NumberFormat('es-ES');

/** 1240 → "1.240" (también con 4 cifras, que Intl no agrupa en es-ES). */
export function fmt(n: number): string {
  const s = nf.format(n);
  return Math.abs(n) >= 1000 && Math.abs(n) < 10000 && !s.includes('.')
    ? s.replace(/^(-?\d)(\d{3})/, '$1.$2')
    : s;
}

export interface Delta {
  pct: number;
  dir: 'up' | 'down' | 'flat';
  text: string;
  /** Texto para lectores de pantalla */
  aria: string;
}

export function delta(now: number, prev: number): Delta {
  if (prev === 0) {
    return now === 0
      ? { pct: 0, dir: 'flat', text: '=', aria: 'igual que la semana pasada' }
      : { pct: 100, dir: 'up', text: '▲ nuevo', aria: 'antes no había ninguno' };
  }
  const pct = Math.round(((now - prev) / prev) * 100);
  if (pct === 0) return { pct, dir: 'flat', text: '=', aria: 'igual que antes' };
  const dir = pct > 0 ? 'up' : 'down';
  return {
    pct,
    dir,
    text: `${dir === 'up' ? '▲' : '▼'} ${Math.abs(pct)} %`,
    aria: `${dir === 'up' ? 'sube' : 'baja'} un ${Math.abs(pct)} %`,
  };
}

export function timeAgo(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ayer' : `hace ${d} días`;
}

export function dayLabel(d = new Date()): string {
  const s = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function shortRange(from: string, to: string): string {
  const o: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  const a = new Date(from).toLocaleDateString('es-ES', o);
  const b = new Date(to).toLocaleDateString('es-ES', o);
  return `${a} – ${b}`;
}
