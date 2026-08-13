import { NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/auth/session';
import { arricchisciEsercenti, RicercaNonConfigurata } from '@/lib/tassonomia/ricerca';

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
export const maxDuration = 120;

export async function POST(): Promise<NextResponse> {
  if ((await getAuthorizedUser()) === null) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    return NextResponse.json(await arricchisciEsercenti(20));
  } catch (errore) {
    const messaggio = errore instanceof Error ? errore.message : String(errore);
    const atteso = errore instanceof RicercaNonConfigurata;
    if (!atteso) console.error('[ricerca] fallita:', messaggio);
    return NextResponse.json({ error: messaggio }, { status: atteso ? 400 : 500 });
  }
}
