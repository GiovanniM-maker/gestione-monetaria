import { NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/auth/session';
import { eseguiSincronizzazioneQuotidiana, RICERCA_COL_BROWSER_MS } from '@/lib/sync/quotidiano';
import { scadeTutto } from '@/lib/supabase/cache';

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
 *
 * Da qui l'origine e' sempre `apertura`, ed e' un fatto e non una comodita':
 * c'e' una sessione valida, quindi il cliente **e' presente**. Due conseguenze
 * — non conta nel tetto PSD2 delle quattro letture al giorno, e lascia una riga
 * `manual` invece di `cron`, cosi' una riga `cron` continua a voler dire
 * «lo scheduler ha girato» e non «qualcuno ha premuto un bottone».
 */
export async function POST(): Promise<NextResponse> {
  if ((await getAuthorizedUser()) === null) {
    return risposta({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    return risposta(await eseguiSincronizzazioneQuotidiana(RICERCA_COL_BROWSER_MS, 'apertura'));
  } catch (errore) {
    const messaggio = errore instanceof Error ? errore.message : String(errore);
    console.error('[quotidiano] fallita:', messaggio);
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
