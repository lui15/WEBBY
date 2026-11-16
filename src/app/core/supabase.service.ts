import { Injectable, computed, signal } from '@angular/core';
import { Session, createClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

/** Cliente de Supabase (esquema "webby") y sesión de Luis. */
@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly client = createClient(environment.supabaseUrl, environment.supabaseKey, {
    db: { schema: 'webby' },
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'webby-auth', experimental: { passkey: true } },
  });

  private readonly _session = signal<Session | null | undefined>(undefined);
  /** undefined = comprobando; null = sin sesión */
  readonly session = this._session.asReadonly();
  readonly ready = computed(() => this._session() !== undefined);

  /** Se resuelve cuando ya se sabe si hay sesión guardada. */
  readonly initialized: Promise<void>;

  constructor() {
    this.initialized = this.client.auth.getSession().then(({ data }) => this._session.set(data.session));
    this.client.auth.onAuthStateChange((_e, s) => this._session.set(s));
  }

  async signIn(email: string, password: string): Promise<string | null> {
    const { error } = await this.client.auth.signInWithPassword({ email, password });
    if (!error) return null;
    if (/invalid login/i.test(error.message)) return 'El correo o la contraseña no son correctos.';
    if (/email not confirmed/i.test(error.message)) return 'Tienes que confirmar tu correo antes de entrar.';
    return 'No se pudo entrar. Revisa tu conexión e inténtalo de nuevo.';
  }

  /** El navegador puede usar huella / cara / PIN del dispositivo (WebAuthn). */
  passkeySupported(): boolean {
    return typeof window !== 'undefined' && 'PublicKeyCredential' in window && window.isSecureContext;
  }

  /** Entrar con la huella (passkey). Devuelve un mensaje si falla, o null si ha ido bien. */
  async signInWithPasskey(): Promise<string | null> {
    const { error } = await this.client.auth.signInWithPasskey();
    if (!error) return null;
    const code = (error as { code?: string }).code ?? '';
    if (/passkey_disabled/.test(code + error.message)) return 'La entrada con huella aún no está activada en el servidor.';
    if (/credential_not_found/.test(code + error.message)) return 'Este móvil no tiene tu huella guardada para Webby. Entra con tu correo y actívala.';
    if (/abort|cancel|NotAllowed/i.test(code + error.message)) return null;
    return 'No se pudo entrar con la huella. Prueba otra vez o entra con tu correo.';
  }

  /** Guarda la huella de este dispositivo para entrar la próxima vez. */
  async registerPasskey(): Promise<string | null> {
    const { error } = await this.client.auth.registerPasskey();
    if (!error) {
      localStorage.setItem('webby-huella', 'si');
      return null;
    }
    const code = (error as { code?: string }).code ?? '';
    if (/credential_exists/.test(code + error.message)) {
      localStorage.setItem('webby-huella', 'si');
      return null;
    }
    if (/abort|cancel|NotAllowed/i.test(code + error.message)) return 'Cancelado.';
    if (/passkey_disabled/.test(code + error.message)) return 'La entrada con huella aún no está activada en el servidor.';
    return 'No se pudo guardar la huella: ' + error.message;
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut();
  }

  /** Llama a una Edge Function con tu sesión. */
  async fn<T>(name: string, body: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.client.functions.invoke<T>(name, { body });
    if (error) throw new Error('No se pudo hablar con el servidor de Webby.');
    return data as T;
  }
}
