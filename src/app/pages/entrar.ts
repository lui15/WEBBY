import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonContent, IonIcon } from '@ionic/angular';
import { HuellaService, WEBBY_URL } from '../core/huella.service';
import { SupabaseService } from '../core/supabase.service';
import { AppLogo } from '../shared/app-logo';
import { ThemeToggle } from '../shared/theme-toggle';

type Paso = 'entrar' | 'ofrecer-huella' | 'desbloquear';

@Component({
  selector: 'app-entrar',
  host: { class: 'ion-page' },
  imports: [IonContent, IonIcon, FormsModule, AppLogo, ThemeToggle],
  template: `
    <ion-content>
      <div class="bg" aria-hidden="true">
        <span class="glow g1"></span><span class="glow g2"></span><span class="glow g3"></span>
        <svg class="line" viewBox="0 0 400 120" preserveAspectRatio="none">
          <polyline points="0,100 60,86 110,92 170,60 230,70 290,34 350,40 400,12" />
        </svg>
      </div>
      <div class="top"><app-theme-toggle /></div>

      <main class="wrap">
        <header class="hero">
          <app-logo [size]="76" />
          <h1>Webby</h1>
          <p class="tag">Tus webs, tus números y tu equipo de IA. Todo listo cada mañana.</p>
          <ul class="sites" aria-label="Tus webs">
            <li><span class="dot" style="background: var(--obralocal)"></span>ObraLocal</li>
            <li><span class="dot" style="background: var(--mudanzas)"></span>Mudanzas360</li>
            <li><span class="dot" style="background: var(--armamuebles)"></span>ArmaMuebles</li>
          </ul>
        </header>

        @if (paso() === 'desbloquear') {
          <section class="card panel offer">
            <span class="fp" aria-hidden="true"><ion-icon name="finger-print-outline" /></span>
            <h2>Hola de nuevo, Luis</h2>
            <p class="muted">Pon tu huella para abrir Webby.</p>
            @if (error()) {
              <p class="err" role="alert">{{ error() }}</p>
            }
            <button type="button" class="btn btn-solid big" (click)="desbloquear()" [disabled]="!!busy()">
              <ion-icon name="finger-print-outline" aria-hidden="true" />
              {{ busy() ? 'Esperando tu huella…' : 'Desbloquear con huella' }}
            </button>
            <button type="button" class="btn-link" (click)="usarContrasena()">Usar mi contraseña</button>
          </section>
        } @else if (paso() === 'entrar') {
          <section class="card panel">
            @if (huella === 'passkey') {
              <button type="button" class="btn btn-solid big" (click)="conHuella()" [disabled]="busy()">
                <ion-icon name="finger-print-outline" aria-hidden="true" />
                {{ busy() === 'huella' ? 'Esperando tu huella…' : 'Entrar con huella' }}
              </button>
              <p class="or"><span>o con tu correo</span></p>
            }

            <form (submit)="$event.preventDefault(); submit()">
              <label for="email">Correo</label>
              <input id="email" name="email" type="email" autocomplete="username email webauthn" required
                     placeholder="tu@correo.com" [ngModel]="email()" (ngModelChange)="email.set($event)" />
              <label for="pw">Contraseña</label>
              <div class="pw">
                <input id="pw" name="pw" [type]="ver() ? 'text' : 'password'" autocomplete="current-password" required
                       [ngModel]="password()" (ngModelChange)="password.set($event)" />
                <button type="button" class="eye" (click)="ver.set(!ver())"
                        [attr.aria-label]="ver() ? 'Ocultar contraseña' : 'Mostrar contraseña'">
                  <ion-icon [name]="ver() ? 'eye-off-outline' : 'eye-outline'" aria-hidden="true" />
                </button>
              </div>
              @if (error()) {
                <p class="err" role="alert">{{ error() }}</p>
              }
              <button type="submit" class="btn" [class.btn-solid]="!huella" [disabled]="!!busy() || !email() || !password()">
                {{ busy() === 'pw' ? 'Entrando…' : 'Entrar' }}
                <ion-icon name="arrow-forward-outline" aria-hidden="true" />
              </button>
            </form>
            <p class="hint small muted">Es la misma cuenta que usas en tu app de trabajos.</p>
            @if (otroDominio) {
              <a class="go small" [href]="webbyUrl">
                <ion-icon name="finger-print-outline" aria-hidden="true" />
                Para entrar con tu huella, abre Webby en webby.armamuebles.es
              </a>
            }
          </section>
        } @else {
          <section class="card panel offer">
            <span class="fp" aria-hidden="true"><ion-icon name="finger-print-outline" /></span>
            <h2>¿Entrar con tu huella la próxima vez?</h2>
            <p class="muted">Sin escribir la contraseña. Tu huella no sale de este dispositivo: solo confirma que eres tú.</p>
            @if (error()) {
              <p class="err" role="alert">{{ error() }}</p>
            }
            <button type="button" class="btn btn-solid big" (click)="activarHuella()" [disabled]="!!busy()">
              <ion-icon name="finger-print-outline" aria-hidden="true" />
              {{ busy() ? 'Esperando tu huella…' : 'Sí, activar huella' }}
            </button>
            <button type="button" class="btn-link" (click)="ahoraNo()">Ahora no</button>
          </section>
        }

        <footer class="foot small muted">
          <a href="/privacidad.html">Privacidad</a> · Solo para el dueño de las tres webs
        </footer>
      </main>
    </ion-content>
  `,
  styles: `
    :host { --glow-a: 0.35; }
    .bg { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
    .glow { position: absolute; width: 380px; height: 380px; border-radius: 50%; filter: blur(70px); opacity: var(--glow-a); }
    .g1 { background: var(--obralocal); top: -140px; left: -120px; }
    .g2 { background: var(--mudanzas); top: 30%; right: -160px; }
    .g3 { background: var(--armamuebles); bottom: -170px; left: 20%; }
    .line { position: absolute; left: 0; right: 0; bottom: 6%; width: 100%; height: 120px; opacity: 0.18; }
    .line polyline { fill: none; stroke: var(--text); stroke-width: 2; vector-effect: non-scaling-stroke; }
    @media (prefers-color-scheme: dark) { :host { --glow-a: 0.22; } }

    .top { position: relative; display: flex; justify-content: flex-end; padding: 16px var(--gutter) 0; }
    .wrap {
      position: relative; max-width: 420px; min-height: calc(100% - 60px); margin: 0 auto;
      padding: 8px var(--gutter) 28px; display: flex; flex-direction: column; justify-content: center; gap: 22px;
    }
    .hero { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 6px; }
    .hero app-logo { filter: drop-shadow(0 10px 24px rgb(0 0 0 / 0.25)); }
    h1 { margin: 12px 0 0; font-family: var(--font-title); font-size: 34px; letter-spacing: -0.02em; }
    .tag { margin: 0; max-width: 300px; line-height: 1.45; color: var(--muted); }
    .sites { list-style: none; display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; margin: 10px 0 0; padding: 0; }
    .sites li {
      display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 999px;
      background: color-mix(in srgb, var(--card) 80%, transparent); border: 1px solid var(--border);
      font-size: 12px; font-weight: 600; backdrop-filter: blur(6px);
    }
    .dot { width: 8px; height: 8px; border-radius: 50%; }

    .panel {
      display: flex; flex-direction: column; gap: 10px; padding: 20px;
      background: color-mix(in srgb, var(--card) 88%, transparent); backdrop-filter: blur(14px);
      box-shadow: 0 18px 50px rgb(0 0 0 / 0.12);
    }
    .big { height: 56px; font-size: 16px; display: flex; align-items: center; justify-content: center; gap: 10px; }
    .big ion-icon { font-size: 24px; }
    .or { display: flex; align-items: center; gap: 10px; margin: 4px 0; color: var(--muted); font-size: 12px; }
    .or::before, .or::after { content: ''; flex: 1; height: 1px; background: var(--border); }
    form { display: flex; flex-direction: column; gap: 6px; }
    label { font-size: 13px; font-weight: 600; margin-top: 4px; }
    input {
      width: 100%; height: 50px; padding: 0 14px; border-radius: 14px; border: 1px solid var(--border);
      background: var(--bg); color: var(--text); font: inherit; font-size: 16px;
    }
    input:focus { outline: 2px solid var(--text); outline-offset: 1px; }
    .pw { position: relative; }
    .pw input { padding-right: 52px; }
    .eye {
      position: absolute; right: 4px; top: 3px; width: 44px; height: 44px; border: 0; background: none;
      color: var(--muted); display: grid; place-items: center; font-size: 20px; cursor: pointer;
    }
    form .btn { margin-top: 12px; height: 50px; display: flex; align-items: center; justify-content: center; gap: 8px; }
    .btn:disabled { opacity: 0.5; }
    .err { margin: 6px 0 0; color: var(--down); font-size: 13px; line-height: 1.45; }
    .hint { margin: 4px 0 0; text-align: center; }

    .offer { align-items: center; text-align: center; }
    .fp {
      width: 72px; height: 72px; border-radius: 50%; display: grid; place-items: center; font-size: 38px;
      background: var(--soft-green); color: var(--up);
    }
    .offer h2 { margin: 6px 0 0; font-family: var(--font-title); font-size: 20px; }
    .offer p { margin: 0; line-height: 1.5; }
    .offer .big { width: 100%; margin-top: 8px; }

    .go {
      display: flex; align-items: center; justify-content: center; gap: 6px; min-height: 44px;
      color: var(--text); font-weight: 600; text-decoration: none; text-align: center;
    }
    .go ion-icon { font-size: 18px; flex: none; }
    .foot { text-align: center; }
    .foot a { color: inherit; }
  `,
})
export class EntrarPage {
  private readonly sb = inject(SupabaseService);
  private readonly router = inject(Router);
  private readonly hs = inject(HuellaService);
  /** 'passkey' (web en webby.armamuebles.es), 'nativa' (app Android) o null */
  protected readonly huella = this.hs.modo;
  protected readonly otroDominio = this.hs.otroDominio;
  protected readonly webbyUrl = WEBBY_URL;

  constructor() {
    // App de Android con sesión guardada y huella activada: pedir la huella directamente.
    void this.sb.initialized.then(() => {
      if (this.sb.session() && this.hs.bloqueada()) {
        this.paso.set('desbloquear');
        void this.desbloquear();
      }
    });
  }

  protected async desbloquear(): Promise<void> {
    this.busy.set('huella');
    this.error.set(null);
    const err = await this.hs.entrar();
    this.busy.set(false);
    if (!err) this.entrarEnWebby();
    else if (err !== 'Cancelado.') this.error.set(err);
  }

  protected async usarContrasena(): Promise<void> {
    await this.sb.signOut();
    this.error.set(null);
    this.paso.set('entrar');
  }
  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly ver = signal(false);
  protected readonly busy = signal<false | 'pw' | 'huella'>(false);
  protected readonly error = signal<string | null>(null);
  protected readonly paso = signal<Paso>('entrar');

  private entrarEnWebby(): void {
    this.router.navigateByUrl('/inicio', { replaceUrl: true });
  }

  protected async conHuella(): Promise<void> {
    this.busy.set('huella');
    this.error.set(null);
    const err = await this.hs.entrar();
    this.busy.set(false);
    if (err) this.error.set(err);
    else if (this.sb.session()) this.entrarEnWebby();
  }

  protected async submit(): Promise<void> {
    this.busy.set('pw');
    this.error.set(null);
    const err = await this.sb.signIn(this.email().trim(), this.password());
    this.busy.set(false);
    if (err) {
      this.error.set(err);
      return;
    }
    // Acaba de escribir la contraseña: en la app nativa no hace falta pedir también la huella.
    this.hs.desbloqueada.set(true);
    if (this.huella && !this.hs.preguntada() && (await this.hs.disponible())) this.paso.set('ofrecer-huella');
    else this.entrarEnWebby();
  }

  protected async activarHuella(): Promise<void> {
    this.busy.set('huella');
    this.error.set(null);
    const err = await this.hs.activar();
    this.busy.set(false);
    if (err) this.error.set(err);
    else this.entrarEnWebby();
  }

  protected ahoraNo(): void {
    this.hs.rechazar();
    this.entrarEnWebby();
  }
}
