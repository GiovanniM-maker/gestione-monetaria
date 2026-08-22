import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { comeArray } from '@/lib/enablebanking/redact';
import { cache } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { inCache } from '@/lib/supabase/cache';

/**
 * La conferma di fine giornata.
 *
 * Due operazioni distinte e non una con parametri opzionali, perche' fanno due
 * cose diverse a `manually_categorized`:
 *
 * - **confermare** dice «la proposta va bene»: la riga resta agganciata al suo
 *   esercente e ne segue le future modifiche. L'utente ha approvato una regola,
 *   non inciso un valore.
 * - **correggere** dice «questa riga fa eccezione» — il computer da Euronics —
 *   e da li' in poi nessun automatismo la tocca piu'.
 */

export type RigaDaConfermare = {
  id: string;
  booking_date: string;
  amount: string;
  amount_eur: string | null;
  currency: string;
  stato: string;
  raw_description: string | null;
  /**
   * La controparte: chi ha ricevuto (o mandato) i soldi. Arriva con la 0053 —
   * prima la vista non la portava, e i bonifici si presentavano con la
   * causale della banca («Inviato da Revolut»), che dice il canale e non il
   * destinatario. Opzionale finche' la migration non e' applicata.
   */
  counterparty_raw?: string | null;
  discrezionalita: string | null;
  contesto: string | null;
  manually_categorized: boolean;
  note: string | null;
  merchant_id: string | null;
  esercente: string | null;
  origine_classificazione: string | null;
  esercente_confermato_at: string | null;
  motivazione: string | null;
  category_id: string | null;
  categoria: string | null;
  /**
   * Perche' questa riga e' nella lista: `nuovo` o `senza categoria`.
   *
   * Le due chiedono due gesti diversi — su una nuova «va bene» e' la risposta,
   * su una scoperta non serve a niente — e senza questa parola la schermata
   * offrirebbe lo stesso bottone per due situazioni diverse.
   *
   * Opzionale perche' arriva dalla 0042: finche' non e' applicata la vista non
   * la manda, e la schermata deve continuare a funzionare.
   */
  motivo?: string | null;
};

export const leggiDaConfermare = cache(
  inCache(
    'da-confermare',
    async (supabase: SupabaseClient): Promise<readonly RigaDaConfermare[]> => {
      const { data } = await supabase
        .from('v_da_confermare')
        .select('*')
        .order('booking_date', { ascending: false })
        .limit(100);
      return comeArray<RigaDaConfermare>(data);
    },
  ),
);

/**
 * I pagamenti delle ultime ventiquattro ore, confermati o no.
 *
 * ---------------------------------------------------------------------------
 * Perche' accanto a quelli da confermare, e non al posto loro
 * ---------------------------------------------------------------------------
 * Le due liste rispondono a due domande diverse. «Da confermare» chiede
 * un'azione e si svuota: e' la lista della sera, e il suo pregio e' che
 * finisce. «Ultime 24 ore» non si svuota mai e non chiede niente: serve a
 * **rivedere**, cioe' a riconoscere una spesa che non ricordi o accorgerti di
 * un addebito che non hai fatto — e per quello contano anche le righe che hai
 * gia' approvato dieci minuti fa.
 *
 * La finestra e' sulla **data contabile**, che e' un giorno civile: «ultime 24
 * ore» significa oggi e ieri. Non si converte niente in fusi orari, per la
 * stessa ragione di sempre — una conversione UTC sposterebbe i movimenti di
 * inizio e fine giornata nel giorno sbagliato.
 *
 * Ci sono anche le `pending`: qui non si conferma niente, e un addebito appena
 * fatto e' proprio quello che si vuole vedere. Sulla lista da confermare invece
 * restano fuori, perche' possono cambiare importo.
 */
/** Come una riga da confermare, piu' il fatto che possa esserlo gia'. */
export type RigaRecente = RigaDaConfermare & { confermato_at: string | null };

const finestraDiOggi = inCache(
  'ultimi-movimenti',
  async (supabase: SupabaseClient, ieri: string, oggi: string): Promise<readonly RigaRecente[]> => {
    const { data } = await supabase
      .from('v_ultimi_movimenti')
      .select('*')
      .gte('booking_date', ieri)
      .lte('booking_date', oggi)
      .order('booking_date', { ascending: false })
      .limit(100);

    return comeArray<RigaRecente>(data);
  },
);

export const leggiUltime24Ore = cache(async (): Promise<readonly RigaRecente[]> => {
  // Il giorno civile di Roma, non quello del server: il fuso applicativo e'
  // `Europe/Rome`, e su una macchina in UTC dopo le 23 «oggi» sarebbe domani.
  const oggi = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
  const ieri = new Date(Date.now() - 24 * 60 * 60 * 1000).toLocaleDateString('sv-SE', {
    timeZone: 'Europe/Rome',
  });

  // I due giorni si calcolano **fuori** e viaggiano come argomenti, quindi
  // finiscono nella chiave. Calcolati dentro, a mezzanotte la cache
  // continuerebbe a servire la finestra di ieri sotto l'intestazione di oggi
  // per un minuto: e' esattamente il modo di far comparire i dati di luglio
  // sotto l'intestazione di agosto, in piccolo.
  return finestraDiOggi(ieri, oggi);
});

/** Quante ne restano da confermare. Serve al conteggio sul cruscotto. */
export const quanteDaConfermare = cache(
  inCache('da-confermare-quante', async (supabase: SupabaseClient): Promise<number> => {
    const { count } = await supabase
      .from('v_da_confermare')
      .select('id', { count: 'exact', head: true });
    return count ?? 0;
  }),
);

export class ConfermaNonValida extends Error {}

const CONTESTI = ['personale', 'business'];

export type RichiestaConferma = {
  id: string;
  /** Assenti = «va bene cosi'». Presenti = questa riga fa eccezione. */
  discrezionalita?: string | null;
  contesto?: string | null;
  note?: string | null;
};

export async function confermaMovimento(richiesta: RichiestaConferma): Promise<void> {
  if (typeof richiesta.id !== 'string' || richiesta.id.trim() === '') {
    throw new ConfermaNonValida('Movimento non indicato.');
  }

  const d = richiesta.discrezionalita ?? null;
  const c = richiesta.contesto ?? null;
  const n = richiesta.note ?? null;

  // La classe non si valida qui: la scrittura passa da `categorizza_movimento`,
  // che chiama `valida_classe` ed elenca nel messaggio le classi di adesso.
  // Una copia in TypeScript elencherebbe quelle di quando e' stata scritta.
  if (c !== null && !CONTESTI.includes(c)) {
    throw new ConfermaNonValida(`Contesto non ammesso: ${c}`);
  }

  const supabase = await createSupabaseServerClient();

  // Confermare e correggere sono due operazioni diverse, e quale delle due sia
  // lo decide il fatto che l'utente abbia cambiato qualcosa: senza modifiche
  // la riga NON va marcata `manually_categorized`, o si bloccherebbe alla
  // classificazione di oggi anche quando quella dell'esercente cambia domani.
  const correzione = d !== null || c !== null || (n !== null && n.trim() !== '');

  const { error } = correzione
    ? await supabase.rpc('correggi_movimento', {
        p_id: richiesta.id,
        p_discrezionalita: d,
        p_contesto: c,
        p_note: n,
      })
    : await supabase.rpc('conferma_movimento', { p_id: richiesta.id });

  if (error !== null) throw new Error(`Conferma fallita: ${error.message}`);
}

/**
 * «Va bene» su tutte quelle che si stanno guardando.
 *
 * Esiste perche' due giorni saltati trasformano la lista della sera in quindici
 * righe identiche, e una lista di arretrati non si smaltisce: si chiude. E' un
 * `update` solo — quindici conferme sarebbero quindici viaggi fino al
 * database, cioe' cinque secondi di schermata ferma.
 *
 * **Non incide niente**: come la sua sorella singola non tocca
 * `manually_categorized`, quindi le righe continuano a seguire il loro
 * esercente. Approvare in blocco non e' una scorciatoia per fare eccezioni in
 * blocco: quelle restano una riga per volta.
 */
/**
 * Disfare una conferma.
 *
 * ---------------------------------------------------------------------------
 * Perche' esiste, e perche' NON copre la correzione
 * ---------------------------------------------------------------------------
 * «Va bene» e' un gesto solo che tocca un campo solo: `confermato_at`. Disfarlo
 * e' rimetterlo a `null`, e non c'e' nient'altro da ricostruire — per questo un
 * annulla qui e' onesto.
 *
 * **La correzione no.** Quella marca `manually_categorized`, che e' la cosa piu'
 * vicina a un'incisione che ci sia nello schema: disfarla vorrebbe dire
 * indovinare cosa c'era prima fra discrezionalita', contesto e note, e
 * rimettere a `false` un flag che l'utente ha alzato riempiendo un modulo. Una
 * correzione si disfa correggendo di nuovo, e va bene cosi': e' un atto
 * deliberato, non un tocco.
 *
 * Non passa da una funzione SQL perche' non ce n'e' bisogno — la policy di
 * `transactions` ammette gia' l'update per l'utente autenticato — ma resta
 * un'**operazione nominata**, come vuole la regola della Fase 0: il copilota
 * puo' chiamarla, un `onClick` no.
 */
export async function disconfermaMovimenti(ids: readonly string[]): Promise<number> {
  const puliti = ids.filter((i) => typeof i === 'string' && i.trim() !== '');
  if (puliti.length === 0) throw new ConfermaNonValida('Nessun movimento indicato.');
  if (puliti.length > 100) throw new ConfermaNonValida(`Troppi movimenti: ${puliti.length}`);

  const supabase = await createSupabaseServerClient();
  const { error, count } = await supabase
    .from('transactions')
    .update({ confermato_at: null }, { count: 'exact' })
    .in('id', puliti)
    // Solo quelle che sono davvero confermate: senza, un annulla arrivato due
    // volte direbbe di aver disfatto righe che non aveva confermato lui.
    .not('confermato_at', 'is', null);

  if (error !== null) throw new Error(`Annullamento fallito: ${error.message}`);
  return count ?? 0;
}

export async function confermaMovimenti(ids: readonly string[]): Promise<number> {
  const puliti = ids.filter((i) => typeof i === 'string' && i.trim() !== '');
  if (puliti.length === 0) throw new ConfermaNonValida('Nessun movimento indicato.');
  if (puliti.length > 100) throw new ConfermaNonValida(`Troppi movimenti: ${puliti.length}`);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('conferma_movimenti', { p_ids: puliti });
  if (error !== null) throw new Error(`Conferma in blocco fallita: ${error.message}`);
  return typeof data === 'number' ? data : 0;
}
