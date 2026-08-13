import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { comeArray } from '@/lib/enablebanking/redact';
import type { RigaAbbonamento, RigaEsclusa, RigaMetrica } from './formato';

// Rilette dal modulo puro e riesportate: chi legge queste query trova i tipi
// dove se li aspetta, senza che la schermata debba importare questo file.
export type { RigaAbbonamento, RigaEsclusa } from './formato';
export { CRITERIO_RICORRENZA } from './formato';

/**
 * Il lato applicativo della Fase 5.
 *
 * Volutamente sottile: il rilevamento **non e' qui**, e' nella funzione SQL
 * `rileva_abbonamenti()`. Questo modulo la chiama e legge le viste.
 *
 * La ragione non e' estetica. La Fase 10 prevede di chiedere all'app «quali
 * abbonamenti sono cresciuti di prezzo» o «sposta questa transazione in un
 * altro cluster»: un copilot puo' invocare una funzione SQL e interrogare una
 * vista, non puo' entrare dentro un ciclo TypeScript scritto per un gestore di
 * click. Ogni operazione che l'utente potra' chiedere a parole deve esistere
 * come funzione con una firma esplicita — e la UI la chiama esattamente come la
 * chiamera' il copilot.
 */

/**
 * Le colonne `numeric` si chiedono **sempre** con `::text`.
 *
 * PostgREST serializza `numeric` come numero JSON, e un importo passato da un
 * float e' un importo di cui non ci si puo' piu' fidare. E' gia' costato un
 * errore in Fase 4.
 */
const COLONNE_ABBONAMENTO =
  'id, esercente, categoria, discrezionalita, contesto, tipo, cadence, cadence_days::text, ' +
  'expected_amount::text, typical_amount::text, total_amount::text, covered_days::text, ' +
  'nella_metrica, costo_mensile::text, ' +
  'first_seen, last_seen, next_expected, occurrences, active_months, ' +
  'confidence::text, amount_stability::text, status, usage_verdict, notes';

export type EsitoRilevamento = {
  scritte: number;
  /** Quante righe entrano davvero nel numero, non quante ne esistono. */
  nellaMetrica: number;
  totali: number;
  metrica: readonly RigaMetrica[];
  escluse: readonly RigaEsclusa[];
  /**
   * Movimenti che il rilevamento non ha potuto vedere perche' privi di importo
   * in euro.
   *
   * Oggi e' zero, e va riportato proprio per questo: il giorno in cui smette di
   * esserlo — un conto in valuta collegato, un tasso mancante — il costo
   * ricorrente comincia a mancare di qualcosa, e senza questa riga non se ne
   * accorgerebbe nessuno. E' la stessa ragione per cui `v_monthly_totals` conta
   * `senza_cambio` invece di far sparire il movimento dal totale in silenzio.
   */
  senzaCambio: { movimenti: number; esercenti: number };
};

/**
 * Ricalcola gli abbonamenti dai movimenti e restituisce cosa ne e' uscito.
 *
 * Rieseguibile senza effetti cumulativi: la funzione SQL ricalcola tutto da
 * capo e non tocca mai i campi dell'utente (`usage_verdict`, `notes`, e lo
 * stato `cancelled`, che e' una sua dichiarazione e non un'osservazione).
 */
export async function rilevaAbbonamenti(minimoOccorrenze = 3): Promise<EsitoRilevamento> {
  const supabase = await createSupabaseServerClient();

  const { data: scritte, error } = await supabase.rpc('rileva_abbonamenti', {
    minimo_occorrenze: minimoOccorrenze,
  });
  if (error !== null) {
    throw new Error(`Rilevamento fallito: ${error.message}`);
  }

  const riepilogo = await leggiRiepilogo();
  return { scritte: Number(scritte ?? 0), ...riepilogo };
}

export async function leggiRiepilogo(): Promise<{
  metrica: readonly RigaMetrica[];
  escluse: readonly RigaEsclusa[];
  nellaMetrica: number;
  totali: number;
  senzaCambio: { movimenti: number; esercenti: number };
}> {
  const supabase = await createSupabaseServerClient();

  const [
    { data: metrica },
    { data: escluse },
    { count: totali },
    { count: nellaMetrica },
    { data: fuori },
  ] = await Promise.all([
    supabase
      .from('v_recurring_monthly_cost_by_discretion')
      .select('tipo, discrezionalita, contesto, ricorrenze, costo_mensile::text'),
    supabase
      .from('v_ricorrenze_escluse')
      .select('motivo, esercenti, costo_mensile_potenziale::text, totale_speso::text'),
    supabase.from('subscriptions').select('id', { count: 'exact', head: true }),
    supabase
      .from('v_subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('nella_metrica', true),
    supabase.from('v_ricorrenze_senza_cambio').select('movimenti, esercenti').maybeSingle(),
  ]);

  const senza = fuori as { movimenti: number | null; esercenti: number | null } | null;

  return {
    metrica: comeArray<RigaMetrica>(metrica),
    escluse: comeArray<RigaEsclusa>(escluse),
    nellaMetrica: nellaMetrica ?? 0,
    totali: totali ?? 0,
    senzaCambio: {
      movimenti: Number(senza?.movimenti ?? 0),
      esercenti: Number(senza?.esercenti ?? 0),
    },
  };
}

/** Tutti gli abbonamenti, dal piu' caro al mese al meno caro. */
export async function leggiAbbonamenti(): Promise<readonly RigaAbbonamento[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('v_subscriptions')
    .select(COLONNE_ABBONAMENTO)
    // Le uscite sono negative, quindi crescente = dal piu' caro.
    .order('costo_mensile', { ascending: true, nullsFirst: false });
  return comeArray<RigaAbbonamento>(data);
}

export const GIUDIZI = ['usato', 'non_usato', 'da_valutare'] as const;
export type Giudizio = (typeof GIUDIZI)[number];

export class GiudizioNonValido extends Error {}

export type RichiestaGiudizio = {
  id: string;
  /** `null` cancella il giudizio, riportando la riga a «non ancora deciso». */
  usageVerdict?: Giudizio | null;
  /** L'utente dichiara di aver disdetto, oppure ritira la dichiarazione. */
  disdetto?: boolean;
  notes?: string | null;
};

/**
 * Le scritture dell'utente su un abbonamento.
 *
 * Sono l'unica cosa che il rilevamento non ricalcola: `usage_verdict`, `notes`
 * e lo stato `cancelled` sono affermazioni di una persona — «questo non lo uso»,
 * «l'ho disdetto» — e nessuna osservazione sui movimenti le smentisce. Un
 * abbonamento disdetto oggi continua a produrre addebiti per un mese, e se il
 * rilevamento potesse riportarlo ad `active` il giudizio sarebbe inutile.
 *
 * Togliere la disdetta rimette `active` e lascia che sia il prossimo
 * rilevamento a decidere se e' ancora vivo o e' ormai `lapsed`: e' la sola
 * risposta onesta, perche' quel giudizio si legge dai movimenti e non da qui.
 */
export async function aggiornaGiudizio(richiesta: RichiestaGiudizio): Promise<RigaAbbonamento> {
  if (typeof richiesta.id !== 'string' || richiesta.id.trim() === '') {
    throw new GiudizioNonValido('Abbonamento non indicato.');
  }

  const modifiche: Record<string, unknown> = {};

  if (richiesta.usageVerdict !== undefined) {
    if (richiesta.usageVerdict !== null && !GIUDIZI.includes(richiesta.usageVerdict)) {
      throw new GiudizioNonValido(`Giudizio non ammesso: ${String(richiesta.usageVerdict)}`);
    }
    modifiche['usage_verdict'] = richiesta.usageVerdict;
    modifiche['verdict_updated_at'] =
      richiesta.usageVerdict === null ? null : new Date().toISOString();
  }

  if (richiesta.disdetto !== undefined) {
    modifiche['status'] = richiesta.disdetto ? 'cancelled' : 'active';
  }

  if (richiesta.notes !== undefined) {
    const testo = typeof richiesta.notes === 'string' ? richiesta.notes.trim() : null;
    modifiche['notes'] = testo === '' ? null : testo;
  }

  if (Object.keys(modifiche).length === 0) {
    throw new GiudizioNonValido('Niente da aggiornare.');
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('subscriptions').update(modifiche).eq('id', richiesta.id);
  if (error !== null) throw new Error(`Aggiornamento fallito: ${error.message}`);

  // Si rilegge dalla vista invece di ricostruire la riga in memoria: cosi' la
  // schermata mostra quello che c'e' scritto davvero, non quello che credevamo
  // di aver scritto.
  const { data } = await supabase
    .from('v_subscriptions')
    .select(COLONNE_ABBONAMENTO)
    .eq('id', richiesta.id)
    .maybeSingle();

  if (data === null) throw new GiudizioNonValido('Abbonamento inesistente.');
  return data as unknown as RigaAbbonamento;
}
