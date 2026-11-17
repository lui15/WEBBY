import { Injectable, inject, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { NativeBiometric } from '@capgo/capacitor-native-biometric';
import { SupabaseService } from './supabase.service';

/**
 * Entrar con la huella, de dos formas según dónde se abra Webby:
 *  - Web / app instalada desde el navegador: passkey de Supabase (WebAuthn). Solo funciona
 *    en webby.armamuebles.es, porque la passkey está ligada al dominio armamuebles.es.
 *  - App de Android (Capacitor): huella nativa del móvil. La sesión ya se guarda en el
 *    móvil; la huella "desbloquea" Webby al abrirla.
 */
export type ModoHuella = 'passkey' | 'nativa' | null;

const KEY = 'webby-huella';
const PASSKEY_DOMAIN = 'armamuebles.es';
export const WEBBY_URL = 'https://webby.armamuebles.es';

@Injectable({ providedIn: 'root' })
export class HuellaService {
  private readonly sb = inject(SupabaseService);

  readonly nativa = Capacitor.isNativePlatform();
  private readonly host = typeof location !== 'undefined' ? location.hostname : '';
  private readonly enDominio = this.host === PASSKEY_DOMAIN || this.host.endsWith('.' + PASSKEY_DOMAIN);

  readonly modo: ModoHuella = this.nativa
    ? 'nativa'
    : this.enDominio && typeof window !== 'undefined' && 'PublicKeyCredential' in window && window.isSecureContext
      ? 'passkey'
      : null;

  /** Web abierta desde otra dirección (p. ej. vercel.app): la huella solo va en webby.armamuebles.es. */
  readonly otroDominio = !this.nativa && !this.enDominio && this.host !== 'localhost' && this.host !== '127.0.0.1';

  /** En la app nativa: ya se ha comprobado la huella en esta apertura. */
  readonly desbloqueada = signal(false);

  activada(): boolean {
    try {
      return localStorage.getItem(KEY) === 'si';
    } catch {
      return false;
    }
  }

  /** Ya se le ofreció (sí o no): no volver a preguntar tras cada inicio de sesión. */
  preguntada(): boolean {
    try {
      return localStorage.getItem(KEY) !== null;
    } catch {
      return true;
    }
  }

  rechazar(): void {
    try {
      localStorage.setItem(KEY, 'no');
    } catch { /* sin almacenamiento */ }
  }

  /** App nativa con huella activada y sin comprobar todavía en esta apertura. */
  bloqueada(): boolean {
    return this.modo === 'nativa' && this.activada() && !this.desbloqueada();
  }

  async disponible(): Promise<boolean> {
    if (this.modo === 'passkey') return true;
    if (this.modo !== 'nativa') return false;
    try {
      const r = await NativeBiometric.isAvailable();
      return r.isAvailable;
    } catch {
      return false;
    }
  }

  /** Entrar (passkey) o desbloquear (nativa). Devuelve un mensaje si falla, null si ha ido bien. */
  async entrar(): Promise<string | null> {
    if (this.modo === 'passkey') return this.sb.signInWithPasskey();
    if (this.modo === 'nativa') {
      const err = await this.verificar();
      if (!err) this.desbloqueada.set(true);
      return err;
    }
    return 'Este dispositivo no permite entrar con huella.';
  }

  /** Guardar la huella para la próxima vez (hay que haber entrado con la contraseña). */
  async activar(): Promise<string | null> {
    if (this.modo === 'passkey') return this.sb.registerPasskey();
    if (this.modo === 'nativa') {
      if (!(await this.disponible())) {
        return 'Este móvil no tiene ninguna huella guardada. Añádela en los ajustes del móvil y vuelve a probar.';
      }
      const err = await this.verificar();
      if (err) return err;
      try {
        localStorage.setItem(KEY, 'si');
      } catch { /* sin almacenamiento */ }
      this.desbloqueada.set(true);
      return null;
    }
    return 'Este dispositivo no permite entrar con huella.';
  }

  desactivar(): void {
    try {
      localStorage.removeItem(KEY);
    } catch { /* sin almacenamiento */ }
  }

  private async verificar(): Promise<string | null> {
    try {
      await NativeBiometric.verifyIdentity({
        reason: 'Entrar en Webby',
        title: 'Entrar en Webby',
        subtitle: 'Pon tu huella para continuar',
        negativeButtonText: 'Usar contraseña',
      });
      return null;
    } catch (e) {
      const msg = String((e as { message?: string; code?: string })?.message ?? e);
      if (/cancel|negative|user/i.test(msg)) return 'Cancelado.';
      return 'No se reconoció la huella. Prueba otra vez o entra con tu contraseña.';
    }
  }
}
