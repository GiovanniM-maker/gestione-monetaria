import { NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/auth/session';
import { eseguiSincronizzazioneQuotidiana } from '@/lib/sync/quotidiano';
import { scadeTutto } from '@/lib/supabase/cache';

export const dynamic = 'force-dynamic';
/**
 * Sessanta secondi e non trecento.
 *
 * Questo giro fa tre cose sole — scarica sette giorni, normalizza, applica gli
 * alias — e sono secondi, non minuti. Un tetto alto qui non servirebbe a
 * finire: servirebbe a **restare appeso** per cinque minuti quando la banca non
 * risponde, mentre il browser ne rilancia un altro fra cinque.
 */
export const maxDuration = 60;

/**
 * L'aggiornamento frequente: «e' arrivato qualcosa?».
 *
 * ---------------------------------------------------------------------------
 * Perche' e' una route sua e non un parametro di quella accanto
 * ---------------------------------------------------------------------------
 * `/api/admin/quotidiano` fa la **sequenza intera**: dopo lo scarico chiede al
 * modello di classificare gli esercenti mai visti, cerca sul web chi sono,
 * ricalcola tutte le ricorrenze, rigenera gli avvisi. E' giusto che lo faccia
 * quattro volte al giorno; farlo dodici volte all'ora sarebbe pagare dodici
 * volte all'ora per rispondere sempre «niente di nuovo».
 *
 * Qui si fanno i tre passi che rispondono davvero alla domanda «e' arrivato
 * qualcosa?», e sono anche i soli che non costano niente oltre alla chiamata
 * alla banca.
 *
 * ---------------------------------------------------------------------------
 * Ogni cinque minuti si puo', e perche'
 * ---------------------------------------------------------------------------
 * Il tetto della PSD2 — quattro letture del conto al giorno — vale per gli
 * accessi **senza nessuno davanti**. Qui c'e' una sessione valida e l'app e' in
 * primo piano: il cliente e' presente, e quegli accessi non sono contingentati.
 *
 * Il freno resta, ma e' l'altro: quattro minuti fra due scarichi, deciso dal
 * server. Un contatore nel browser si azzera ricaricando, e due schede aperte
 * ne avrebbero due — la protezione di una risorsa non puo' stare dalla parte
 * che chiede.
 */
export async function POST(): Promise<NextResponse> {
  if ((await getAuthorizedUser()) === null) {
    return risposta({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    return risposta(
      await eseguiSincronizzazioneQuotidiana({ origine: 'apertura', profilo: 'veloce' }),
    );
  } catch (errore) {
    const messaggio = errore instanceof Error ? errore.message : String(errore);
    console.error('[aggiorna] fallito:', messaggio);
    return risposta({ error: messaggio }, { status: 500 });
  }
}

/** Come le sue sorelle: ogni risposta butta la cache dei dati, anche in errore. */
function risposta(corpo: unknown, opzioni?: ResponseInit): NextResponse {
  scadeTutto();
  return NextResponse.json(corpo, opzioni);
}
