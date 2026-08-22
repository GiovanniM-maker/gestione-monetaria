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
const PUBLIC_PATHS = ['/login', '/auth/error', '/privacy', '/terms'] as const;

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

/**
 * Quanto e' costata la verifica della sessione, in millisecondi, come
 * `Server-Timing`.
 *
 * ---------------------------------------------------------------------------
 * Perche' misurare proprio questo
 * ---------------------------------------------------------------------------
 * `updateSession` fa `getUser()`, che e' una **chiamata di rete** al server di
 * auth Supabase, e succede **prima** che parta la prima query sui dati. Ogni
 * richiesta la paga: e' il primo pezzo del tempo che passa fra il tocco e la
 * schermata.
 *
 * `docs/prestazioni.md` la stima in ~60 ms nella stessa regione e ~200 ms fra
 * due continenti, e la parola che conta e' **stima**: nessuno l'ha mai
 * misurata dall'interno. Un header la rende un numero, visibile negli strumenti
 * per sviluppatori accanto al TTFB, senza aggiungere nessuna dipendenza e senza
 * mandare niente a un servizio terzo — che su un'applicazione di dati bancari e'
 * il motivo principale per non installare un pannello di analytics.
 *
 * Non e' un segreto: dice quanto ha impiegato una chiamata, non chi l'ha fatta.
 */
function conTempo(risposta: NextResponse, avvio: number): NextResponse {
  risposta.headers.set('Server-Timing', `auth;dur=${Math.round(performance.now() - avvio)}`);
  return risposta;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith(CRON_PATH_PREFIX)) {
    return NextResponse.next();
  }

  const avvio = performance.now();
  const { response, user, supabase } = await updateSession(request);
  const isApiRoute = pathname.startsWith('/api/');

  // Sessione valida ma email fuori allowlist: la si chiude subito. Puo'
  // succedere se un utente viene creato a mano nel pannello Supabase.
  if (user !== null && !isAllowedEmail(user.email)) {
    await supabase.auth.signOut();
    if (isApiRoute) {
      return conTempo(NextResponse.json({ error: 'forbidden' }, { status: 403 }), avvio);
    }
    return conTempo(
      redirectPreservingCookies(request, '/auth/error', response, { reason: 'not_allowed' }),
      avvio,
    );
  }

  if (user === null && !isPublicPath(pathname)) {
    if (isApiRoute) {
      return conTempo(NextResponse.json({ error: 'unauthorized' }, { status: 401 }), avvio);
    }
    return conTempo(redirectPreservingCookies(request, '/login', response), avvio);
  }

  if (user !== null && pathname === '/login') {
    return conTempo(redirectPreservingCookies(request, '/', response), avvio);
  }

  return conTempo(response, avvio);
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
