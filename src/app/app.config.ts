import { ApplicationConfig, importProvidersFrom } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';
import { OBD_ADAPTER } from './core/adapters/obd-adapter.interface';
import { WebBluetoothElm327AdapterService } from './core/adapters/web-bluetooth-elm327-adapter.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideCharts(withDefaultRegisterables()),
    { provide: OBD_ADAPTER, useClass: WebBluetoothElm327AdapterService }
  ]
};
