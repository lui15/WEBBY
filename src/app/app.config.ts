import {
  ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular';
import { routes } from './app.routes';
import { registerIcons } from './shared/icons';

registerIcons();

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding()),
    provideIonicAngular({ mode: 'md' }),
  ],
};
