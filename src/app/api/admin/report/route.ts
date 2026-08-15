import { NextResponse, type NextRequest } from 'next/server';
import { getAuthorizedUser } from '@/lib/auth/session';
import { generaReport, mesePrecedente } from '@/lib/report/genera';
import { scadeTutto } from '@/lib/supabase/cache';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(request: NextRequest): Promise<NextResponse> {
  if ((await getAuthorizedUser()) === null) {
    return risposta({ error: 'unauthorized' }, { status: 401 });
  }

  const chiesto = request.nextUrl.searchParams.get('mese');
  const mese =
    chiesto !== null && /^\d{4}-\d{2}$/.test(chiesto) ? `${chiesto}-01` : mesePrecedente();

  try {
    return risposta(await generaReport(mese));
  } catch (errore) {
    const messaggio = errore instanceof Error ? errore.message : String(errore);
    console.error('[report] generazione fallita:', messaggio);
    return risposta({ error: messaggio }, { status: 500 });
  }
}

/**
 * Ogni risposta di questa route butta la cache dei dati.
 *
 * Anche quelle di errore, ed e' voluto: invalidare di troppo costa una query,
 * invalidare di meno costa un numero vecchio mostrato come fresco. Nel dubbio
 * si butta.
 */
function risposta(corpo: unknown, opzioni?: ResponseInit): NextResponse {
  scadeTutto();
  return NextResponse.json(corpo, opzioni);
}
