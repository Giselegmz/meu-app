import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { DiarioAuthService } from './diario-auth.service';

export const authenticatedGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(DiarioAuthService);
  const router = inject(Router);
  await auth.initialize();
  if (auth.authenticated()) return true;
  return router.createUrlTree(['/acesso'], {
    queryParams: { returnUrl: state.url },
  });
};

export const accessPageGuard: CanActivateFn = async (route) => {
  const auth = inject(DiarioAuthService);
  const router = inject(Router);
  await auth.initialize();
  if (!auth.authenticated()) return true;
  const returnUrl = route.queryParamMap.get('returnUrl');
  return router.parseUrl(returnUrl?.startsWith('/') ? returnUrl : '/diario');
};
