import { NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/auth/session';
import { applicaTassonomia } from '@/lib/tassonomia/applica';
import { scadeTutto } from '@/lib/supabase/cache';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Applica la tassonomia all'intero storico.
 *
 * Sta sotto `/api/admin/*`, quindi dietro autenticazione di sessione e non
 * dietro un segreto condiviso: tocca dati bancari e la lancia un browser
 * autenticato (CLAUDE.md, regola 6).
 */
export async function POST(): Promise<NextResponse> {
  if ((await getAuthorizedUser()) === null) {
    return risposta({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    return risposta(await applicaTassonomia());
  } catch (errore) {
    const messaggio = errore instanceof Error ? errore.message : String(errore);
    console.error('[tassonomia] categorizzazione fallita:', messaggio);
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
