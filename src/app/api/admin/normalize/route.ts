import { NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/auth/session';
import { normalizzaTutto } from '@/lib/normalize/run';
import { scadeTutto } from '@/lib/supabase/cache';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Rielabora l'intero registro grezzo in `transactions`.
 *
 * Rieseguibile quante volte si vuole: e' il criterio di uscita della Fase 3.
 * Lanciarlo due volte di fila non deve cambiare il conteggio di una riga.
 */
export async function POST(): Promise<NextResponse> {
  if ((await getAuthorizedUser()) === null) {
    return risposta({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    return risposta(await normalizzaTutto());
  } catch (errore) {
    const messaggio = errore instanceof Error ? errore.message : String(errore);
    console.error('[normalize] errore:', messaggio);
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
