import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { comeArray } from '@/lib/enablebanking/redact';
import { creaBackfill, eseguiFettaBackfill } from './backfill';
import { normalizzaTutto, type EsitoNormalizzazione } from '@/lib/normalize/run';
import { applicaTassonomia } from '@/lib/tassonomia/applica';
import { proponiClassificazioni } from '@/lib/tassonomia/proposte';
import {
  arricchisciEsercenti,
  ricercaConfigurata,
  BUDGET_SENZA_BROWSER,
  type EsitoArricchimento,
} from '@/lib/tassonomia/ricerca';
import { rilevaAbbonamenti, type EsitoRilevamento } from '@/lib/abbonamenti/rileva';
import { GIORNI_DI_STORICO, generaAvvisi, pulisciAvvisi } from '@/lib/avvisi/leggi';
import type { AccountRow, BankConnectionRow, SyncTrigger } from '@/lib/db/types';

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

/**
 * Quante volte al giorno si puo' chiamare la banca **senza nessuno davanti**.
 *
 * Non e' una scelta di prudenza: e' il tetto della PSD2. Un AISP puo' leggere
 * il conto **quattro volte in ventiquattr'ore** quando il cliente non e'
 * presente; oltre, l'ASPSP pretende una nuova autenticazione forte. E' anche
 * il motivo per cui `docs/direzione.md` aveva deciso «quattro al giorno».
 *
 * Quindi la schedulazione a quattro ore c'e' — sei giri, uno ogni quattro ore
 * — ma i giri che troverebbero il tetto gia' pieno **non chiamano la banca**:
 * fanno lo stesso il lavoro locale, che e' gratis, e scrivono perche' hanno
 * saltato. L'alternativa era che dal quinto giro in poi la banca rispondesse
 * di no, riempiendo `sync_runs` di fallimenti e mettendo il consenso in uno
 * stato che non si capisce piu'.
 *
 * La freschezza vera non la da' comunque il tetto: la da' l'apertura
 * dell'app, che e' un accesso **con il cliente presente** e non conta.
 */
const ACCESSI_NON_PRESIDIATI_AL_GIORNO = 4;

/**
 * Quanto deve passare fra due scarichi con il cliente presente.
 *
 * Senza questa soglia, passare da «Oggi» a «Dove» e tornare indietro
 * chiamerebbe la banca tre volte in un minuto, e due schede aperte
 * raddoppierebbero tutto. Con il cliente presente non c'e' un tetto normativo
 * da rispettare, ma non e' un buon motivo per bussare quando la risposta e'
 * gia' in mano.
 *
 * Quattro e non cinque: il browser ricontrolla ogni cinque minuti, e una
 * soglia uguale al passo del pendolo verrebbe mancata di un soffio una volta
 * su due, dando un aggiornamento ogni dieci minuti invece che ogni cinque.
 */
const MINUTI_FRA_DUE_SCARICHI = 4;

/**
 * Chi ha chiesto la sincronizzazione, e cambia due cose sole.
 *
 * `schedulata` — nessuno davanti: conta nel tetto delle quattro, e lascia una
 * riga `cron` in `sync_runs`.
 * `apertura` — l'utente ha aperto l'app o premuto il bottone: e' un accesso
 * «customer present», non conta nel tetto, e lascia una riga `manual`.
 *
 * Che le due lascino tracce **diverse** non e' un dettaglio. Fino al 16 agosto
 * 2026 il bottone scriveva anche lui `cron`, e quando e' servito capire se lo
 * scheduler avesse mai girato le uniche quattro righe che c'erano erano
 * indistinguibili dai tocchi sul bottone di quel pomeriggio. Da qui in avanti
 * una riga `cron` **prova** che lo scheduler ha girato.
 */
export type Origine = 'schedulata' | 'apertura';

/**
 * Quanto lavoro fare dopo aver scaricato.
 *
 * ---------------------------------------------------------------------------
 * Perche' due profili e non uno solo piu' frequente
 * ---------------------------------------------------------------------------
 * «Aggiorna le spese ogni cinque minuti» e «rifai tutta la sequenza ogni
 * cinque minuti» sembrano la stessa richiesta e non lo sono. Dopo lo scarico la
 * sequenza chiede al modello di classificare gli esercenti mai visti, cerca sul
 * web chi sono, ricalcola tutte le ricorrenze e rigenera gli avvisi: e' lavoro
 * che costa denaro a ogni chiamata e che **non ha niente di nuovo da fare**
 * dodici volte all'ora. Un movimento nuovo arriva a ogni ora del giorno; un
 * esercente mai visto no, e una ricorrenza cambia di mese in mese.
 *
 * `veloce` — scarica, normalizza, applica la tassonomia che c'e' gia'. Sono i
 * passi che rispondono alla domanda «e' arrivato qualcosa?», e sono anche i soli
 * che non costano niente oltre alla chiamata alla banca. Il movimento nuovo
 * compare subito, e se il suo esercente non si conosce ancora finisce in «Da
 * confermare» come **senza categoria** — che e' visibile, non perso.
 *
 * `completo` — tutto il resto, e resta dove stava: i quattro giri schedulati e
 * il bottone di `/debug/sync`.
 */
export type Profilo = 'completo' | 'veloce';

export type OpzioniSincronizzazione = {
  budgetRicercaMs?: number;
  origine?: Origine;
  profilo?: Profilo;
};

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
  ricerca: EsitoArricchimento | null;
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
    ricerca: null,
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

/**
 * Quanta ricerca sul mondo fare, e perche' dipende da chi ha chiamato.
 *
 * La sequenza e' la stessa per il cron e per il bottone — «il bottone non e' un
 * doppione della schedulazione: chiama la stessa funzione» — ma il tempo
 * disponibile no. Dietro il cron non c'e' nessuno; dietro il bottone c'e' un
 * browser che tiene aperta una connessione, e una richiesta che resta muta
 * troppo a lungo **non torna**: misurato tre volte, e ogni volta il lavoro era
 * stato fatto e il resoconto perso.
 *
 * Quindi non due funzioni diverse: la stessa, con un budget che dice quanto si
 * puo' far aspettare chi guarda.
 */
export const RICERCA_COL_BROWSER_MS = 20_000;

export async function eseguiSincronizzazioneQuotidiana(
  opzioni: OpzioniSincronizzazione = {},
): Promise<EsitoQuotidiano> {
  const budgetRicercaMs = opzioni.budgetRicercaMs ?? BUDGET_SENZA_BROWSER;
  const origine = opzioni.origine ?? 'schedulata';
  const profilo = opzioni.profilo ?? 'completo';
  const avvio = Date.now();
  const esito = vuoto();
  const traccia: SyncTrigger = origine === 'apertura' ? 'manual' : 'cron';
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
      trigger: traccia,
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
  // 1. Scarico — se si puo' chiamare la banca
  // ---------------------------------------------------------------------
  // I passi locali girano comunque, come gia' girano quando lo scarico
  // fallisce: sono idempotenti, lavorano su cio' che c'e', e non costano una
  // chiamata alla banca.
  const permesso = await sipuoChiamareLaBanca(connessione.id, origine);
  if (permesso !== null) esito.avvisi = [permesso];

  if (permesso === null) {
    try {
      const corsa = await creaBackfill({
        connectionId: connessione.id,
        accountUids: uid,
        dateFrom: giorniFa(GIORNI_INDIETRO),
        dateTo: null,
        trigger: traccia,
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
    const primaPassata = await applicaTassonomia();

    // Il profilo veloce si ferma qui, ed e' tutta la differenza fra un
    // aggiornamento che si puo' fare ogni cinque minuti e uno che non si puo'.
    // Quello che resta sotto — la ricerca sul web, le proposte del modello, il
    // rilevamento delle ricorrenze, gli avvisi — costa denaro a ogni chiamata e
    // non ha niente di nuovo da fare dodici volte all'ora.
    if (profilo === 'veloce') {
      esito.categorizzazione = {
        speseAbbinate: primaPassata.speseAbbinate,
        speseEsaminate: primaPassata.speseEsaminate,
      };
      esito.durataMs = Date.now() - avvio;
      return esito;
    }

    // Prima di chiedere al modello di indovinare, si va a vedere cosa dice il
    // mondo. E' l'ordine che conta: la ricerca serve ad arricchire il contesto
    // della proposta, non a correggerla dopo.
    //
    // Qui il ciclo puo' essere lungo — nessun browser da tenere in linea — ed
    // e' il posto naturale per smaltire un arretrato: a un secondo per
    // esercente, duecento nomi sono qualche notte, senza che nessuno guardi.
    // Se la chiave non c'e', si salta in silenzio: la classificazione continua
    // a funzionare, solo peggio.
    if (ricercaConfigurata()) {
      try {
        esito.ricerca = await arricchisciEsercenti(200, budgetRicercaMs);
      } catch (errore) {
        // Una ricerca fallita non deve fermare la sequenza: e' un
        // miglioramento della classificazione, non un suo presupposto.
        esito.avvisi = [
          ...esito.avvisi,
          `Ricerca sul mondo fallita: ${errore instanceof Error ? errore.message : String(errore)}`,
        ];
      }
    }

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

    // E la pulizia dello storico dopo la generazione: oltre i novanta giorni
    // un avviso si elimina. Se ne parla nel resoconto solo quando ha tolto
    // qualcosa — una riga «0 eliminati» a ogni giro insegna a non leggerlo.
    const eliminati = await pulisciAvvisi();
    if (eliminati > 0) {
      esito.avvisi = [
        ...esito.avvisi,
        `${eliminati} ${eliminati === 1 ? 'avviso più vecchio' : 'avvisi più vecchi'} di ${GIORNI_DI_STORICO} giorni eliminati dallo storico.`,
      ];
    }
  } catch (errore) {
    const messaggio = errore instanceof Error ? errore.message : String(errore);
    esito.errore = esito.errore === null ? messaggio : `${esito.errore} · ${messaggio}`;
  }

  esito.durataMs = Date.now() - avvio;
  return esito;
}

/**
 * Se questo giro puo' chiamare la banca. `null` = si', altrimenti il perche' no.
 *
 * ---------------------------------------------------------------------------
 * Due domande diverse, non la stessa con due soglie
 * ---------------------------------------------------------------------------
 * **Schedulata**: quante volte abbiamo gia' letto il conto oggi senza nessuno
 * davanti? Il tetto e' quattro in ventiquattr'ore ed e' della PSD2, non nostro.
 * Si contano solo le righe `cron`, che sono per costruzione gli accessi non
 * presidiati — e' esattamente per poterle contare che dal 16 agosto 2026 il
 * bottone e l'apertura scrivono `manual`.
 *
 * **Apertura**: nessun tetto, perche' il cliente e' presente. La sola domanda
 * e' se valga la pena: se l'ultimo scarico e' di pochi minuti fa la risposta e'
 * gia' in mano, e passare da una scheda all'altra non deve bussare alla banca
 * ogni volta.
 *
 * Si guarda l'**inizio** della corsa e non la fine: una corsa ancora aperta ha
 * `finished_at` nullo, e ordinare su una colonna che puo' essere nulla farebbe
 * sembrare che non abbiamo mai chiamato proprio mentre stiamo chiamando.
 *
 * ---------------------------------------------------------------------------
 * Un giro che salta non lascia una riga, ed e' voluto
 * ---------------------------------------------------------------------------
 * L'invariante su cui poggia tutto e' **una riga `cron` = una lettura del conto
 * senza nessuno davanti**. Registrare anche i giri saltati la romperebbe: il
 * conteggio si gonfierebbe da solo, e dopo quattro salti si bloccherebbe anche
 * chi non ha mai chiamato la banca. Il motivo del salto torna comunque nella
 * risposta — che e' cio' che si legge nel log del cron di Vercel e su
 * `/debug/sync` — e `ultima_sync_riuscita` non avanza, che e' giusto: non e'
 * arrivato niente.
 */
async function sipuoChiamareLaBanca(
  connectionId: string,
  origine: Origine,
): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const conta = async (da: Date, soloCron: boolean): Promise<number> => {
    let query = supabase
      .from('sync_runs')
      .select('id', { count: 'exact', head: true })
      .eq('connection_id', connectionId)
      .gte('started_at', da.toISOString());
    if (soloCron) query = query.eq('trigger', 'cron');
    const { count } = await query;
    return count ?? 0;
  };

  const adesso = Date.now();
  return decidiAccesso({
    origine,
    nonPresidiatiIn24Ore: await conta(new Date(adesso - 24 * 60 * 60 * 1000), true),
    scarichiRecenti:
      origine === 'apertura'
        ? await conta(new Date(adesso - MINUTI_FRA_DUE_SCARICHI * 60 * 1000), false)
        : 0,
  });
}

/**
 * La regola, senza database intorno: `null` = si puo' chiamare la banca.
 *
 * Separata perche' e' l'unica parte che si puo' sbagliare in silenzio — un
 * `<` al posto di un `<=` qui vuol dire cinque letture al giorno invece di
 * quattro, e la banca lo scopre prima di noi.
 */
export function decidiAccesso(input: {
  origine: Origine;
  /** Letture `cron` nelle ultime 24 ore: sono per costruzione quelle senza nessuno davanti. */
  nonPresidiatiIn24Ore: number;
  /** Scarichi di qualunque origine negli ultimi `MINUTI_FRA_DUE_SCARICHI` minuti. */
  scarichiRecenti: number;
}): string | null {
  if (input.origine === 'apertura') {
    return input.scarichiRecenti === 0
      ? null
      : `Scarico già fatto meno di ${MINUTI_FRA_DUE_SCARICHI} minuti fa: si è aggiornato ` +
          'solo ciò che non costa una chiamata alla banca.';
  }

  return input.nonPresidiatiIn24Ore < ACCESSI_NON_PRESIDIATI_AL_GIORNO
    ? null
    : `Tetto PSD2 raggiunto: ${input.nonPresidiatiIn24Ore} letture del conto nelle ultime 24 ore ` +
        `senza nessuno davanti, e il massimo è ${ACCESSI_NON_PRESIDIATI_AL_GIORNO}. ` +
        'Aprendo l’app si scarica lo stesso: con il cliente presente non c’è tetto.';
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
