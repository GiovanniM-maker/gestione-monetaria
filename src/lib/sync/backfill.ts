import 'server-only';
import { EbApiError, getTransactionsPage } from '@/lib/enablebanking/client';
import { comeArray } from '@/lib/enablebanking/redact';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { payloadHash } from './hash';
import type { AccountRow, BackfillCursor, SyncRunRow, SyncTrigger } from '@/lib/db/types';

/**
 * Backfill riavviabile.
 *
 * Il vincolo che determina l'intera forma di questo modulo: **non deve
 * dipendere dal completamento di una singola invocazione serverless**. Due anni
 * di movimenti Revolut sono centinaia di pagine da cinquanta, e una funzione
 * ha un tetto di durata. Quindi il lavoro procede a fette: ogni fetta consuma
 * un budget di tempo, salva il cursore a ogni pagina, e si ferma restituendo
 * "ripartimi". Chi la chiama la richiama finche' non risponde "finito".
 *
 * Salvare il cursore a ogni pagina e non a fine fetta e' la differenza fra
 * riprendere dove ci si era fermati e ricominciare la fetta da capo: un timeout
 * o un errore di rete non devono costare le pagine gia' scaricate.
 */

/** Quanto lavorare prima di restituire il controllo. Sotto il tetto della funzione. */
const BUDGET_MS_PREDEFINITO = 240_000;

/** Margine per chiudere la fetta e scrivere lo stato senza farsi interrompere. */
const MARGINE_MS = 15_000;

export type EsitoFetta = {
  runId: string;
  status: SyncRunRow['status'];
  completato: boolean;
  pagineLette: number;
  righeLette: number;
  righeNuove: number;
  righeDuplicate: number;
  contiCompletati: number;
  contiRimanenti: number;
  /** Cose andate diversamente dal richiesto, ma non abbastanza da fermare la corsa. */
  avvisi: readonly string[];
  errore: string | null;
};

/**
 * Una pagina di transazioni, con un ripiego se la banca rifiuta la finestra
 * richiesta.
 *
 * Serve per lo storico lungo. Chiedere `date_from` a due anni fa e' l'unico
 * modo di ottenere i due anni che Revolut dichiara — lasciando le date vuote la
 * banca restituisce la sua finestra predefinita, che sul campo si e' vista di
 * 90 giorni. Ma se quella data cade fuori da cio' che la banca concede, la
 * richiesta torna 4xx: senza ripiego l'intera corsa fallisce e si perde anche
 * lo storico che *era* disponibile.
 *
 * Il ripiego vale solo sulla **prima pagina di un conto**: un rifiuto su una
 * pagina successiva riguarda il `continuation_key`, non l'intervallo, e
 * riprovare senza date ricomincerebbe il conto da capo.
 *
 * Non e' silenzioso: chi chiama riceve un avviso e lo mostra. Un backfill che
 * scarica meno di quanto chiesto senza dirlo e' peggio di uno che fallisce.
 */
async function leggiPagina(
  uid: string,
  cursore: BackfillCursor,
  avvisi: string[],
): Promise<unknown> {
  const opzioni = {
    dateFrom: cursore.dateFrom ?? undefined,
    dateTo: cursore.dateTo ?? undefined,
    continuationKey: cursore.continuationKey ?? undefined,
  };

  try {
    return await getTransactionsPage(uid, opzioni);
  } catch (errore) {
    const ripiegabile =
      errore instanceof EbApiError &&
      errore.status >= 400 &&
      errore.status < 500 &&
      opzioni.continuationKey === undefined &&
      opzioni.dateFrom !== undefined;

    if (!ripiegabile) throw errore;

    avvisi.push(
      `Conto ${uid.slice(0, 8)}…: la banca ha rifiutato date_from=${opzioni.dateFrom} ` +
        `(${(errore as EbApiError).status}). Riprovo con la finestra predefinita: ` +
        `lo storico scaricato sara' piu' corto di quello richiesto.`,
    );

    return getTransactionsPage(uid, { ...opzioni, dateFrom: undefined });
  }
}

/**
 * Avanza il cursore dopo una pagina. Funzione pura, isolata apposta: e' la
 * logica che decide se si continua sullo stesso conto o si passa al successivo,
 * ed e' l'unico punto in cui un errore produrrebbe transazioni saltate in
 * silenzio.
 */
export function avanzaCursore(
  cursore: BackfillCursor,
  continuationKey: string | null,
): BackfillCursor {
  if (cursore.current === null) return cursore;

  // Altra pagina sullo stesso conto.
  if (continuationKey !== null && continuationKey !== '') {
    return { ...cursore, continuationKey };
  }

  // Conto finito: passa al prossimo.
  return {
    ...cursore,
    completed: [...cursore.completed, cursore.current],
    current: null,
    continuationKey: null,
  };
}

/** Prende in carico il prossimo conto, se ce n'e' uno. */
function prendiProssimoConto(cursore: BackfillCursor): BackfillCursor {
  if (cursore.current !== null) return cursore;
  const [prossimo, ...resto] = cursore.pending;
  if (prossimo === undefined) return cursore;
  return { ...cursore, current: prossimo, pending: resto, continuationKey: null };
}

export function backfillCompletato(cursore: BackfillCursor): boolean {
  return cursore.current === null && cursore.pending.length === 0;
}

export type AvvioBackfill = {
  connectionId: string;
  accountUids: readonly string[];
  dateFrom: string | null;
  dateTo: string | null;
  trigger?: SyncTrigger;
};

/** Crea la corsa e il cursore iniziale. Non scarica ancora niente. */
export async function creaBackfill(input: AvvioBackfill): Promise<SyncRunRow> {
  const supabase = await createSupabaseServerClient();

  const cursore: BackfillCursor = {
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    pending: input.accountUids,
    current: null,
    continuationKey: null,
    completed: [],
  };

  const { data, error } = await supabase
    .from('sync_runs')
    .insert({
      connection_id: input.connectionId,
      trigger: input.trigger ?? 'backfill',
      status: 'running',
      cursor: cursore,
    })
    .select()
    .single<SyncRunRow>();

  if (error !== null || data === null) {
    throw new Error(`Creazione sync_run fallita: ${error?.message ?? 'nessuna riga'}`);
  }

  return data;
}

/**
 * Esegue una fetta di lavoro sulla corsa indicata e restituisce lo stato.
 * Va richiamata finche' `completato` non e' `true`.
 */
export async function eseguiFettaBackfill(
  runId: string,
  budgetMs: number = BUDGET_MS_PREDEFINITO,
): Promise<EsitoFetta> {
  const supabase = await createSupabaseServerClient();
  const scadenza = Date.now() + Math.max(budgetMs - MARGINE_MS, 5_000);

  const { data: run, error: erroreRun } = await supabase
    .from('sync_runs')
    .select('*')
    .eq('id', runId)
    .single<SyncRunRow>();

  if (erroreRun !== null || run === null) {
    throw new Error(`Corsa ${runId} non trovata: ${erroreRun?.message ?? 'nessuna riga'}`);
  }

  if (run.cursor === null) {
    throw new Error(`Corsa ${runId} senza cursore: non e' riavviabile.`);
  }

  // Mappa uid Enable Banking → id del conto nel nostro database. Le righe di
  // raw_transactions referenziano il secondo, non il primo.
  const { data: conti } = await supabase
    .from('accounts')
    .select('id, eb_account_uid')
    .eq('connection_id', run.connection_id ?? '');

  const idPerUid = new Map(
    comeArray<Pick<AccountRow, 'id' | 'eb_account_uid'>>(conti).map((c) => [
      c.eb_account_uid,
      c.id,
    ]),
  );

  let cursore: BackfillCursor = run.cursor;
  const avvisi: string[] = [];
  let pagineLette = 0;
  let righeLette = run.rows_fetched;
  let righeNuove = run.rows_new;
  let righeDuplicate = run.rows_duplicate;

  try {
    while (Date.now() < scadenza) {
      cursore = prendiProssimoConto(cursore);
      if (backfillCompletato(cursore)) break;

      const uid = cursore.current;
      if (uid === null) break;

      const accountId = idPerUid.get(uid);
      if (accountId === undefined) {
        throw new Error(
          `Il conto ${uid} non e' registrato in accounts: lancia prima la registrazione dei conti.`,
        );
      }

      const risposta = await leggiPagina(uid, cursore, avvisi);

      const transazioni = comeArray<unknown>((risposta as { transactions?: unknown }).transactions);
      pagineLette += 1;
      righeLette += transazioni.length;

      if (transazioni.length > 0) {
        const righe = transazioni.map((payload) => ({
          account_id: accountId,
          source: 'enablebanking' as const,
          payload,
          payload_hash: payloadHash(payload),
          sync_run_id: runId,
        }));

        // `ignoreDuplicates` esegue ON CONFLICT DO NOTHING: le righe gia'
        // presenti non vengono restituite, quindi il conteggio dei nuovi
        // inserimenti e' esatto senza una query in piu'.
        const { data: inserite, error: erroreInsert } = await supabase
          .from('raw_transactions')
          .upsert(righe, { onConflict: 'account_id,payload_hash', ignoreDuplicates: true })
          .select('id');

        if (erroreInsert !== null) {
          throw new Error(`Inserimento raw_transactions fallito: ${erroreInsert.message}`);
        }

        const nuove = comeArray<{ id: number }>(inserite).length;
        righeNuove += nuove;
        righeDuplicate += righe.length - nuove;
      }

      const chiave = (risposta as { continuation_key?: unknown }).continuation_key;
      cursore = avanzaCursore(cursore, typeof chiave === 'string' ? chiave : null);

      // Il cursore si salva a OGNI pagina. E' questa riga a rendere il backfill
      // riavviabile: quello che segue puo' fallire senza costare nulla.
      await supabase
        .from('sync_runs')
        .update({
          cursor: cursore,
          rows_fetched: righeLette,
          rows_new: righeNuove,
          rows_duplicate: righeDuplicate,
          accounts_synced: cursore.completed.length,
        })
        .eq('id', runId);
    }
  } catch (errore) {
    const messaggio = errore instanceof Error ? errore.message : String(errore);
    await supabase
      .from('sync_runs')
      .update({
        status: 'failed',
        error_message: messaggio,
        cursor: cursore,
        rows_fetched: righeLette,
        rows_new: righeNuove,
        rows_duplicate: righeDuplicate,
      })
      .eq('id', runId);

    return {
      runId,
      status: 'failed',
      completato: false,
      pagineLette,
      righeLette,
      righeNuove,
      righeDuplicate,
      contiCompletati: cursore.completed.length,
      contiRimanenti: cursore.pending.length + (cursore.current === null ? 0 : 1),
      avvisi,
      errore: messaggio,
    };
  }

  const finito = backfillCompletato(cursore);

  // `last_sync_at` sulla connessione, non solo sulla corsa: e' il campo che in
  // Fase 7 fa scattare l'alert "nessuna sincronizzazione riuscita da giorni",
  // e va scritto solo quando il backfill si e' davvero concluso.
  if (finito && run.connection_id !== null) {
    await supabase
      .from('bank_connections')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('id', run.connection_id);
  }

  await supabase
    .from('sync_runs')
    .update({
      status: finito ? 'success' : 'running',
      finished_at: finito ? new Date().toISOString() : null,
      cursor: cursore,
      accounts_synced: cursore.completed.length,
      rows_fetched: righeLette,
      rows_new: righeNuove,
      rows_duplicate: righeDuplicate,
      error_message: null,
    })
    .eq('id', runId);

  return {
    runId,
    status: finito ? 'success' : 'running',
    completato: finito,
    pagineLette,
    righeLette,
    righeNuove,
    righeDuplicate,
    contiCompletati: cursore.completed.length,
    contiRimanenti: cursore.pending.length + (cursore.current === null ? 0 : 1),
    avvisi,
    errore: null,
  };
}
