import { NextResponse, type NextRequest } from 'next/server';
import { isAllowedEmail } from '@/lib/auth/allowlist';
import { redirectPreservingCookies, updateSession } from '@/lib/supabase/proxy';

/**
 * Proxy applicativo (in Next 16 sostituisce la convenzione `middleware.ts`,
 * deprecata). Gira prima di ogni richiesta che corrisponde al `matcher` in
 * fondo al file.
 *
 * Ogni route, pagina o API, e' protetta da qui. Non esistono eccezioni
 * "temporanee per test": per aggiungere una route pubblica bisogna scriverla
 * in questa lista, e la lista si legge in code review.
 */
const PUBLIC_PATHS = ['/login', '/auth/callback', '/auth/error'] as const;

/**
 * Le route cron NON passano dal controllo di sessione: le invoca Vercel Cron,
 * che non ha un browser ne' un cookie. Sono protette dal proprio helper
 * (`assertCronRequest` in `src/lib/auth/cron.ts`), che verifica l'header
 * `Authorization: Bearer ${CRON_SECRET}` inviato automaticamente da Vercel.
 *
 * Le route `/api/admin/*` invece restano dietro sessione, deliberatamente:
 * le lancia un browser autenticato e toccano dati bancari, quindi non devono
 * dipendere da un segreto condiviso.
 */
const CRON_PATH_PREFIX = '/api/cron/';

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith(CRON_PATH_PREFIX)) {
    return NextResponse.next();
  }

  const { response, user, supabase } = await updateSession(request);
  const isApiRoute = pathname.startsWith('/api/');

  // Sessione valida ma email fuori allowlist: la si chiude subito. Puo'
  // succedere se un utente viene creato a mano nel pannello Supabase.
  if (user !== null && !isAllowedEmail(user.email)) {
    await supabase.auth.signOut();
    if (isApiRoute) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    return redirectPreservingCookies(request, '/auth/error', response, { reason: 'not_allowed' });
  }

  if (user === null && !isPublicPath(pathname)) {
    if (isApiRoute) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    return redirectPreservingCookies(request, '/login', response);
  }

  if (user !== null && pathname === '/login') {
    return redirectPreservingCookies(request, '/', response);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Tutte le richieste tranne gli asset statici serviti da Next e le icone.
     * Non e' un'esenzione di sicurezza: sono file del bundle, non contengono
     * dati applicativi.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2)$).*)',
  ],
};
