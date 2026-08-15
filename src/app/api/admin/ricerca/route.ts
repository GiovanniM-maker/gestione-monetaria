import { NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/auth/session';
import { arricchisciEsercenti, RicercaNonConfigurata } from '@/lib/tassonomia/ricerca';
import { scadeTutto } from '@/lib/supabase/cache';

/**
 * Una fetta di ricerca sul mondo.
 *
 * A fette come il backfill e le proposte, e per la stessa ragione: venti
 * chiamate HTTP in sequenza dentro una sola invocazione la fanno interrompere a
 * metà da Vercel, e il browser legge un 504 che sembra un errore di rete.
 *
 * Sotto `/api/admin/*`, quindi dietro autenticazione di sessione: la lancia un
 * browser autenticato e tocca dati bancari.
 */
export const dynamic = 'force-dynamic';
// Il budget interno e' 90 secondi, questo e' il tetto duro con margine: il
// piano gratuito di Brave concede una richiesta al secondo, quindi il tempo e'
// la risorsa scarsa e la fetta ne usa quanto puo'.
export const maxDuration = 120;

export async function POST(): Promise<NextResponse> {
  if ((await getAuthorizedUser()) === null) {
    return risposta({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    return risposta(await arricchisciEsercenti(80));
  } catch (errore) {
    const messaggio = errore instanceof Error ? errore.message : String(errore);
    const atteso = errore instanceof RicercaNonConfigurata;
    if (!atteso) console.error('[ricerca] fallita:', messaggio);
    return risposta({ error: messaggio }, { status: atteso ? 400 : 500 });
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
