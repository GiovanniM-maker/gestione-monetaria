import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { startAuthorization } from '@/lib/enablebanking/client';

export const dynamic = 'force-dynamic';

/**
 * Avvia l'autorizzazione presso la banca.
 *
 * E' un POST e non un GET di proposito: `<Link>` di Next fa prefetch, e un
 * prefetch su questa route farebbe partire una richiesta di consenso senza che
 * nessuno abbia cliccato niente. Su Intesa, dove il consenso attivo e' uno solo,
 * un prefetch involontario invaliderebbe quello esistente.
 *
 * La route sta sotto `/api/`, quindi il proxy la protegge gia' con la sessione.
 */

/** Durata del consenso richiesta. Le banche possono accorciarla. */
const CONSENT_DAYS = 90;

const STATE_COOKIE = 'eb_auth_state';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const form = await request.formData();
  const aspspName = form.get('aspsp_name');
  const aspspCountry = form.get('aspsp_country');

  if (typeof aspspName !== 'string' || typeof aspspCountry !== 'string') {
    return NextResponse.json(
      { error: 'aspsp_name e aspsp_country sono obbligatori' },
      { status: 400 },
    );
  }

  // Valore casuale legato a questo browser: al ritorno verifichiamo che la
  // risposta corrisponda alla richiesta partita da qui, e non a una indotta.
  const state = randomUUID();

  const validUntil = new Date(Date.now() + CONSENT_DAYS * 24 * 60 * 60 * 1000);
  const redirectUrl = new URL('/api/eb/callback', request.nextUrl.origin).toString();

  try {
    const auth = await startAuthorization({
      aspspName,
      aspspCountry,
      redirectUrl,
      state,
      validUntil,
      psuType: 'personal',
    });

    const response = NextResponse.redirect(auth.url, { status: 303 });
    response.cookies.set(STATE_COOKIE, state, {
      httpOnly: true,
      secure: request.nextUrl.protocol === 'https:',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 15,
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'errore sconosciuto';
    console.error('[eb] avvio autorizzazione fallito:', message);
    return NextResponse.redirect(
      new URL(`/debug/eb?errore=${encodeURIComponent(message)}`, request.nextUrl.origin),
      { status: 303 },
    );
  }
}
