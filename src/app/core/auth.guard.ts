import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SupabaseService } from './supabase.service';

export const authGuard: CanActivateFn = async () => {
  const sb = inject(SupabaseService);
  const router = inject(Router);
  await sb.initialized;
  return sb.session() ? true : router.parseUrl('/entrar');
};
