import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { comeArray } from '@/lib/enablebanking/redact';
import { creaBackfill, eseguiFettaBackfill } from './backfill';
import { normalizzaTutto, type EsitoNormalizzazione } from '@/lib/normalize/run';
import { applicaTassonomia } from '@/lib/tassonomia/applica';
import { proponiClassificazioni } from '@/lib/tassonomia/proposte';
import { rilevaAbbonamenti, type EsitoRilevamento } from '@/lib/abbonamenti/rileva';
import { generaAvvisi } from '@/lib/avvisi/leggi';
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

/**
 * Quante fette di proposte AI al massimo per giro.
 *
 * Non e' un tetto di spesa deciso al posto dell'utente: e' la protezione
 * contro un ciclo che gira a vuoto. Con 15 etichette per fetta sono 60
 * esercenti nuovi a notte, molti piu' di quanti ne arrivino davvero — e se una
 * volta ne arrivassero di piu' (un conto nuovo collegato, un import), il resto
 * aspetta il giro dopo invece che moltiplicare le chiamate in una notte sola.
 * Quante ne restano viene riportato, non ingoiato.
 */
const FETTE_AI_MASSIME = 4;

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
  proposte: {
    inviate: number;
    proposte: number;
    scartate: number;
    trattenute: number;
    rimaste: number;
    costo: number;
  } | null;
  ricorrenze: EsitoRilevamento | null;
  avvisiCreati: number | null;
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
    proposte: null,
    ricorrenze: null,
    avvisiCreati: null,
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
    await applicaTassonomia();

    // Le proposte del modello per gli esercenti mai visti.
    //
    // Senza questo passo la copertura scende ogni notte: i movimenti nuovi
    // arrivano, ma un esercente sconosciuto non ha nessun alias che lo
    // abbini, e resta scoperto finche' qualcuno non se ne accorge. Nessuno se
    // ne accorge, perche' il numero delle classificate resta identico mentre
    // il totale cresce.
    //
    // La regola 8 continua a valere e non e' riimplementata qui: e'
    // `selezionaInviabili` dentro `proponiClassificazioni` a decidere cosa
    // puo' uscire, e le controparti dei bonifici privati restano dentro.
    esito.proposte = await proponiFinche(esito);

    // Seconda passata: le proposte hanno creato esercenti e alias, e senza
    // riapplicare la tassonomia resterebbero scritte e inutilizzate fino al
    // giorno dopo.
    const tassonomia = await applicaTassonomia();
    esito.categorizzazione = {
      speseAbbinate: tassonomia.speseAbbinate,
      speseEsaminate: tassonomia.speseEsaminate,
    };

    esito.ricorrenze = await rilevaAbbonamenti();

    // Gli avvisi per ultimi: leggono cio' che i passi precedenti hanno appena
    // scritto — un aumento di prezzo si vede solo dopo che il rilevamento ha
    // aggiornato `expected_amount`.
    esito.avvisiCreati = await generaAvvisi();
  } catch (errore) {
    const messaggio = errore instanceof Error ? errore.message : String(errore);
    esito.errore = esito.errore === null ? messaggio : `${esito.errore} · ${messaggio}`;
  }

  esito.durataMs = Date.now() - avvio;
  return esito;
}

/**
 * Chiede al modello finche' non resta niente, il modello smette di fare
 * progressi, o si esauriscono le fette concesse.
 *
 * `progresso === false` e' il freno che conta: senza, un lotto che fallisce
 * sempre — modello irraggiungibile, risposte tutte invalide — verrebbe
 * richiamato all'infinito sulle stesse etichette, pagando ogni volta.
 */
async function proponiFinche(esito: EsitoQuotidiano): Promise<EsitoQuotidiano['proposte']> {
  const somma = { inviate: 0, proposte: 0, scartate: 0, trattenute: 0, rimaste: 0, costo: 0 };
  const avvisi = [...esito.avvisi];

  for (let fetta = 0; fetta < FETTE_AI_MASSIME; fetta += 1) {
    const p = await proponiClassificazioni();
    somma.inviate += p.inviate;
    somma.proposte += p.proposte;
    somma.scartate += p.scartate;
    somma.trattenute = p.trattenute;
    somma.rimaste = p.rimaste;
    somma.costo += p.costo ?? 0;

    if (p.rimaste === 0) break;
    if (!p.progresso) {
      avvisi.push(
        'Il modello non ha prodotto nessuna proposta valida in questa fetta: mi fermo ' +
          'invece di richiamarlo sulle stesse etichette.',
      );
      break;
    }
    if (fetta === FETTE_AI_MASSIME - 1 && p.rimaste > 0) {
      avvisi.push(`${p.rimaste} etichette restano da proporre: le prende il giro di domani.`);
    }
  }

  esito.avvisi = avvisi;
  return somma;
}
