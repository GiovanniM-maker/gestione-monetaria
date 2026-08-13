import { NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/auth/session';
import { eseguiSincronizzazioneQuotidiana, RICERCA_COL_BROWSER_MS } from '@/lib/sync/quotidiano';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * La stessa sequenza del cron, lanciata a mano.
 *
 * Non e' un doppione: senza di lei l'automazione si potrebbe provare soltanto
 * aspettando l'ora schedulata, e un lavoro che si prova una volta al giorno di
 * fatto non si prova. Chiama esattamente la stessa funzione — se divergessero,
 * la prova non direbbe niente sul cron.
 *
 * Sotto `/api/admin/*`, quindi dietro sessione e non dietro il segreto cron:
 * la lancia un browser autenticato.
 */
export async function POST(): Promise<NextResponse> {
  if ((await getAuthorizedUser()) === null) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    return NextResponse.json(await eseguiSincronizzazioneQuotidiana(RICERCA_COL_BROWSER_MS));
  } catch (errore) {
    const messaggio = errore instanceof Error ? errore.message : String(errore);
    console.error('[quotidiano] fallita:', messaggio);
    return NextResponse.json({ error: messaggio }, { status: 500 });
  }
}
