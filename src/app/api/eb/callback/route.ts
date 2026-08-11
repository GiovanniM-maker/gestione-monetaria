import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { createSession } from '@/lib/enablebanking/client';

export const dynamic = 'force-dynamic';

/**
 * Ritorno dalla banca dopo la SCA.
 *
 * Questo e' l'URL registrato come redirect nel Control Panel di Enable Banking.
 * Sta sotto `/api/`, quindi il proxy pretende una sessione applicativa valida:
 * chi autorizza dal telefono deve essere gia' loggato su quel dispositivo,
 * altrimenti qui riceve 401.
 *
 * In Fase 1 la sessione Enable Banking viene tenuta in un cookie e nient'altro:
 * non esistono ancora `bank_connections` ne' `accounts`, che sono lavoro della
 * Fase 2.
 */

const STATE_COOKIE = 'eb_auth_state';
const SESSION_COOKIE = 'eb_session_id';

function sameState(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = request.nextUrl;

  const backToDebug = (params: Record<string, string>): NextResponse => {
    const url = new URL('/debug/eb', origin);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return NextResponse.redirect(url);
  };

  const error = searchParams.get('error');
  if (error !== null) {
    return backToDebug({ errore: `La banca ha rifiutato l'autorizzazione: ${error}` });
  }

  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const expectedState = request.cookies.get(STATE_COOKIE)?.value;

  if (code === null || state === null) {
    return backToDebug({ errore: 'Risposta senza code o state.' });
  }

  if (expectedState === undefined) {
    return backToDebug({
      errore:
        'Nessuna autorizzazione in corso su questo browser. Succede se apri il link di ritorno da un dispositivo diverso da quello che ha avviato la richiesta.',
    });
  }

  if (!sameState(state, expectedState)) {
    return backToDebug({ errore: 'Lo state non corrisponde: autorizzazione rifiutata.' });
  }

  try {
    const session = await createSession(code);

    const response = backToDebug({ ok: '1' });
    response.cookies.set(SESSION_COOKIE, session.session_id, {
      httpOnly: true,
      secure: request.nextUrl.protocol === 'https:',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    // Lo state e' monouso: consumato, va rimosso.
    response.cookies.delete(STATE_COOKIE);
    return response;
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : 'errore sconosciuto';
    console.error('[eb] creazione sessione fallita:', message);
    return backToDebug({ errore: message });
  }
}
