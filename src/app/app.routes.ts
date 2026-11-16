import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'inicio' },
  { path: 'entrar', title: 'Entrar · Webby', loadComponent: () => import('./pages/entrar').then((m) => m.EntrarPage) },
  { path: 'inicio', canActivate: [authGuard], title: 'Inicio · Webby', loadComponent: () => import('./pages/inicio').then((m) => m.InicioPage) },
  { path: 'webs', canActivate: [authGuard], title: 'Webs · Webby', loadComponent: () => import('./pages/webs').then((m) => m.WebsPage) },
  { path: 'agentes', canActivate: [authGuard], title: 'Agentes · Webby', loadComponent: () => import('./pages/agentes').then((m) => m.AgentesPage) },
  { path: 'propuestas', canActivate: [authGuard], title: 'Propuestas · Webby', loadComponent: () => import('./pages/propuestas').then((m) => m.PropuestasPage) },
  { path: 'informes', canActivate: [authGuard], title: 'Informes · Webby', loadComponent: () => import('./pages/informes').then((m) => m.InformesPage) },
  { path: '**', redirectTo: 'inicio' },
];
