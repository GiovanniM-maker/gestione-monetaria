import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { comeArray } from '@/lib/enablebanking/redact';
import { creaBackfill, eseguiFettaBackfill } from './backfill';
import { normalizzaTutto, type EsitoNormalizzazione } from '@/lib/normalize/run';
import { applicaTassonomia } from '@/lib/tassonomia/applica';
import { rilevaAbbonamenti, type EsitoRilevamento } from '@/lib/abbonamenti/rileva';
import type { AccountRow, BankConnectionRow } from '@/lib/db/types';

/**
 * La sequenza quotidiana, senza nessuno che la guardi.
 *
 * ---------------------------------------------------------------------------
 * Perche' non riusa il ciclo del backfill
 * ---------------------------------------------------------------------------
 * Il backfill si spezza in fette e il **browser** lo richiama finche' non ha
 * finito. Qui non c'e' un browser: il ciclo deve stare nel server, e deve
 * fermarsi da solo prima che la funzione venga interrotta. Se il budget si
 * esaurisce, il cursore resta salvato e il giorno dopo si riprende — la
 * riavviabilita' scritta in Fase 2 serve esattamente a questo, ed e' il motivo
 * per cui questa fase e' corta.
 *
 * ---------------------------------------------------------------------------
 * Perche' sette giorni e non uno
 * ---------------------------------------------------------------------------
 * Una sincronizzazione che chiedesse solo ieri sarebbe piu' economica e
 * fragile. Tre ragioni per la finestra larga:
 *
 * 1. le **`pending` diventano `booked`** e l'importo puo' cambiare: la riga va
 *    riletta, e la chiave di idempotenza (`entry_reference`) fa il resto;
 * 2. la banca puo' **contabilizzare in ritardo** un movimento di giorni prima;
 * 3. se un giorno il cron non gira — deploy, guasto, quota — la finestra larga
 *    **si ripara da sola** al giro successivo, invece di lasciare un buco
 *    permanente che nessuno noterebbe.
 *
 * Costa poco: sette giorni sono qualche decina di movimenti, cioe' una pagina.
 */

/** Giorni indietro da richiedere alla banca a ogni giro. */
const GIORNI_INDIETRO = 7;

/** Budget del ciclo di fette. Sta sotto `maxDuration`, con margine per il resto. */
const BUDGET_CICLO_MS = 150_000;

/** Budget di una singola fetta dentro il ciclo. */
const BUDGET_FETTA_MS = 60_000;

export type EsitoQuotidiano = {
  /** Valorizzato quando non si e' fatto niente, con il motivo. */
  saltata: string | null;
  runId: string | null;
  fette: number;
  completato: boolean;
  righeLette: number;
  righeNuove: number;
  righeDuplicate: number;
  avvisi: readonly string[];
  normalizzazione: EsitoNormalizzazione | null;
  categorizzazione: { speseAbbinate: number; speseEsaminate: number } | null;
  ricorrenze: EsitoRilevamento | null;
  errore: string | null;
  durataMs: number;
};

function vuoto(): EsitoQuotidiano {
  return {
    saltata: null,
    runId: null,
    fette: 0,
    completato: false,
    righeLette: 0,
    righeNuove: 0,
    righeDuplicate: 0,
    avvisi: [],
    normalizzazione: null,
    categorizzazione: null,
    ricorrenze: null,
    errore: null,
    durataMs: 0,
  };
}

/**
 * `YYYY-MM-DD` di N giorni fa, nel fuso applicativo.
 *
 * Non `toISOString()`: quello formatta in UTC, e vicino a mezzanotte
 * restituirebbe il giorno prima. E' la stessa regola dei giorni civili che
 * vale per `booking_date`, e vale anche per un estremo di intervallo.
 */
function giorniFa(giorni: number): string {
  const data = new Date();
  data.setDate(data.getDate() - giorni);
  return data.toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
}

export async function eseguiSincronizzazioneQuotidiana(): Promise<EsitoQuotidiano> {
  const avvio = Date.now();
  const esito = vuoto();
  const supabase = await createSupabaseServerClient();

  const { data: connessioni } = await supabase
    .from('bank_connections')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1);

  const connessione = comeArray<BankConnectionRow>(connessioni)[0] ?? null;
  if (connessione === null) {
    esito.saltata = 'Nessuna connessione bancaria registrata.';
    esito.durataMs = Date.now() - avvio;
    return esito;
  }

  // Consenso scaduto: ci si ferma **prima** di chiamare la banca, e si lascia
  // una traccia nel database. Un 401 dall'ASPSP direbbe la stessa cosa in modo
  // molto meno leggibile fra sei mesi, e senza `sync_runs` l'unico posto dove
  // resterebbe scritto sarebbe il log del cron, che nessuno legge.
  const scaduto =
    connessione.valid_until !== null && new Date(connessione.valid_until).getTime() < Date.now();

  if (scaduto || connessione.status === 'revoked') {
    const motivo = scaduto
      ? `Consenso ${connessione.aspsp_name} scaduto il ${connessione.valid_until?.slice(0, 10)}.`
      : `Consenso ${connessione.aspsp_name} revocato.`;

    await supabase.from('sync_runs').insert({
      connection_id: connessione.id,
      trigger: 'cron',
      status: 'failed',
      finished_at: new Date().toISOString(),
      error_message: motivo,
    });

    esito.saltata = `${motivo} Va rinnovato: finche' non lo e', non arriva nessun movimento nuovo.`;
    esito.durataMs = Date.now() - avvio;
    return esito;
  }

  const { data: contiGrezzi } = await supabase
    .from('accounts')
    .select('*')
    .eq('connection_id', connessione.id)
    .eq('is_active', true);

  const uid = comeArray<AccountRow>(contiGrezzi).map((c) => c.eb_account_uid);
  if (uid.length === 0) {
    esito.saltata = 'Nessun conto attivo su questa connessione.';
    esito.durataMs = Date.now() - avvio;
    return esito;
  }

  // ---------------------------------------------------------------------
  // 1. Scarico
  // ---------------------------------------------------------------------
  try {
    const corsa = await creaBackfill({
      connectionId: connessione.id,
      accountUids: uid,
      dateFrom: giorniFa(GIORNI_INDIETRO),
      dateTo: null,
      trigger: 'cron',
    });
    esito.runId = corsa.id;

    const scadenza = avvio + BUDGET_CICLO_MS;
    const avvisi: string[] = [];

    // Il ciclo sta qui e non nel browser. Si ferma per budget, non per numero
    // di giri: e' il tempo la risorsa scarsa di una funzione serverless.
    for (;;) {
      const fetta = await eseguiFettaBackfill(corsa.id, BUDGET_FETTA_MS);
      esito.fette += 1;
      esito.righeLette += fetta.righeLette;
      esito.righeNuove += fetta.righeNuove;
      esito.righeDuplicate += fetta.righeDuplicate;
      avvisi.push(...fetta.avvisi);

      if (fetta.errore !== null) {
        esito.errore = fetta.errore;
        break;
      }
      if (fetta.completato) {
        esito.completato = true;
        break;
      }
      if (Date.now() >= scadenza) {
        avvisi.push(
          'Budget esaurito con lo scarico non finito. Il cursore e’ salvato: ' +
            'il prossimo giro riprende da li’.',
        );
        break;
      }
    }

    esito.avvisi = avvisi;
  } catch (errore) {
    esito.errore = errore instanceof Error ? errore.message : String(errore);
  }

  // ---------------------------------------------------------------------
  // 2, 3, 4. Normalizza, categorizza, rileva
  // ---------------------------------------------------------------------
  // Girano **anche se lo scarico e' fallito o e' rimasto a meta'**: sono
  // idempotenti e lavorano su cio' che c'e' gia'. Saltarli lascerebbe il
  // cruscotto indietro rispetto ai dati grezzi gia' presenti, che e' un
  // disallineamento gratuito — e per giunta invisibile.
  try {
    esito.normalizzazione = await normalizzaTutto();

    const tassonomia = await applicaTassonomia();
    esito.categorizzazione = {
      speseAbbinate: tassonomia.speseAbbinate,
      speseEsaminate: tassonomia.speseEsaminate,
    };

    esito.ricorrenze = await rilevaAbbonamenti();
  } catch (errore) {
    const messaggio = errore instanceof Error ? errore.message : String(errore);
    esito.errore = esito.errore === null ? messaggio : `${esito.errore} · ${messaggio}`;
  }

  esito.durataMs = Date.now() - avvio;
  return esito;
}
