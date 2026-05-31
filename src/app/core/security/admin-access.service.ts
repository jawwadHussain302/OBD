import { Injectable, signal } from '@angular/core';

declare global {
  interface Window {
    __OBD_ADMIN__?: boolean;
  }
}

@Injectable({ providedIn: 'root' })
export class AdminAccessService {
  readonly isAdmin = signal<boolean>(window.__OBD_ADMIN__ === true);

  canAccessAdmin(): boolean {
    return this.isAdmin();
  }
}

