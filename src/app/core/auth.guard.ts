import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { HuellaService } from './huella.service';
import { SupabaseService } from './supabase.service';

/** Sin sesión, o con la app bloqueada por huella, se va a /entrar. */
export const authGuard: CanActivateFn = async () => {
  const sb = inject(SupabaseService);
  const huella = inject(HuellaService);
  const router = inject(Router);
  await sb.initialized;
  if (!sb.session() || huella.bloqueada()) return router.parseUrl('/entrar');
  return true;
};
