import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';
import { OBD_ADAPTER } from './core/adapters/obd-adapter.interface';
import { AdapterSwitcherService } from './core/adapters/adapter-switcher.service';
import { WebBluetoothElm327AdapterService } from './core/adapters/web-bluetooth-elm327-adapter.service';
import { SimulatorObdAdapterService } from './core/adapters/simulator-obd-adapter.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideCharts(withDefaultRegisterables()),
    WebBluetoothElm327AdapterService,
    SimulatorObdAdapterService,
    AdapterSwitcherService,
    // All consumers inject OBD_ADAPTER; the switcher proxies real ↔ simulated
    { provide: OBD_ADAPTER, useExisting: AdapterSwitcherService },
  ]
};
