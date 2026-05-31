import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AdminAccessService } from './admin-access.service';

export const adminOnlyGuard: CanActivateFn = () => {
  const adminAccess = inject(AdminAccessService);
  const router = inject(Router);

  if (adminAccess.canAccessAdmin()) {
    return true;
  }

  return router.createUrlTree(['/access-denied']);
};

