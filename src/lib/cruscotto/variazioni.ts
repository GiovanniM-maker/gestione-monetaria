import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { comeArray } from '@/lib/enablebanking/redact';
import { estremiDelMese } from '@/lib/movimenti/filtri';
import { giornoDelMese } from './confronto';
import type {
  VariazioneCategoria,
  VariazioneClasse,
  VariazioneEsercente,
} from '@/lib/cruscotto/andamento';

/**
 * Le variazioni: «rispetto al solito, com'e' andata?».
 *
 * Tre chiamate, nessun calcolo. La percentuale e il giudizio arrivano dalle
 * funzioni della `0036`, che li fanno in SQL — una variazione e' una divisione,
 * e la stessa divisione scritta in tre schermate diventa tre soglie diverse.
 *
 * Gli importi arrivano gia' `text`: il cast sta nella **firma** della funzione
 * e non nella select, perche' da una RPC il chiamante non puo' chiedere
 * `::text` e PostgREST serializzerebbe i `numeric` come numeri JSON, cioe'
 * float.
 */

/**
 * Cosa torna da una lettura di variazioni.
 *
 * Le righe **e** il motivo per cui non ci sono. La prima versione ingoiava
 * l'errore e rispondeva con un elenco vuoto, ed e' stato un difetto vero:
 * finche' le funzioni della `0036` non sono state applicate, la schermata
 * mostrava zero spesa senza dire niente. Un numero mancante che si presenta
 * come uno zero e' il modo di guastarsi che questa applicazione non si puo'
 * permettere, ed e' scritto nero su bianco nelle regole di correttezza —
 * `v_monthly_totals.senza_cambio` esiste per la stessa ragione.
 */
export type Variazioni<T> = { righe: readonly T[]; errore: string | null };

/**
 * Quanti mesi indietro guardare per trovare il mese tipico.
 *
 * Sei e' un compromesso misurato: meno di tre mesi e la mediana non e' una
 * mediana, piu' di dodici e ci si confronta con abitudini che non si hanno
 * piu'. Su questo conto lo storico comincia il 23 settembre 2025, quindi sei
 * mesi sono quasi sempre sei mesi veri.
 */
const MESI_DI_CONFRONTO = 6;

/**
 * La finestra si dichiara sempre.
 *
 * `giorni` e' l'ultimo giorno del mese con dei dati, non oggi: e' lo stesso
 * numero che usa il confronto del totale in cima al cruscotto. Se le due cifre
 * uscissero da due finestre diverse, un giorno di ritardo nell'arrivo dei
 * movimenti farebbe puntare in basso ogni freccia della schermata.
 *
 * `null` significa «mese intero», e su un mese chiuso e' la cosa giusta.
 */
export async function leggiVariazioniClassi(
  mese: string,
  giorni: number | null,
): Promise<Variazioni<VariazioneClasse>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('variazioni_per_classe', {
    p_mese: `${mese}-01`,
    p_mesi_confronto: MESI_DI_CONFRONTO,
    p_giorni: giorni,
  });
  if (error !== null) return { righe: [], errore: error.message };
  return { righe: comeArray<VariazioneClasse>(data), errore: null };
}

export async function leggiVariazioniCategorie(
  mese: string,
  giorni: number | null,
): Promise<Variazioni<VariazioneCategoria>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('variazioni_per_categoria', {
    p_mese: `${mese}-01`,
    p_mesi_confronto: MESI_DI_CONFRONTO,
    p_giorni: giorni,
  });
  if (error !== null) return { righe: [], errore: error.message };
  return { righe: comeArray<VariazioneCategoria>(data), errore: null };
}

/**
 * `categoria` limita al ramo, sottocategorie comprese.
 *
 * Serve sulla scheda di una categoria: senza, la freccia di un esercente
 * piccolo andrebbe cercata fra i primi cento del mese intero, dove non c'e'. Una
 * freccia che compare su alcune righe e non su altre, senza una ragione
 * visibile, e' peggio di nessuna freccia.
 */
export async function leggiVariazioniEsercenti(
  mese: string,
  giorni: number | null,
  limite: number,
  categoria: string | null = null,
): Promise<Variazioni<VariazioneEsercente>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('variazioni_per_esercente', {
    p_mese: `${mese}-01`,
    p_limite: limite,
    p_mesi_confronto: MESI_DI_CONFRONTO,
    p_giorni: giorni,
    p_categoria: categoria,
  });
  if (error !== null) return { righe: [], errore: error.message };
  return { righe: comeArray<VariazioneEsercente>(data), errore: null };
}

/**
 * Fino a che giorno del mese arrivano i dati, e quindi quale finestra usare.
 *
 * Sta qui e non in una schermata perche' e' la **stessa** per tutte: il
 * cruscotto e la scheda di una categoria devono confrontare gli stessi giorni,
 * o due discese dallo stesso numero danno due percentuali diverse.
 *
 * Da ventotto giorni in su il mese si considera finito e si confrontano mesi
 * interi: una finestra di ventinove giorni contro un mese di trentuno non
 * varrebbe la complicazione, e le ultime spese di un mese arrivano comunque
 * dopo.
 */
export async function finestraDiConfronto(mese: string): Promise<{
  giorniCoperti: number | null;
  finestra: number | null;
}> {
  const giorniCoperti = giornoDelMese(await ultimoGiornoConDati(mese));
  return {
    giorniCoperti,
    finestra: giorniCoperti === null || giorniCoperti >= 28 ? null : giorniCoperti,
  };
}

/** L'ultimo giorno del mese in cui c'e' almeno una spesa. */
async function ultimoGiornoConDati(mese: string): Promise<string | null> {
  const estremi = estremiDelMese(mese);
  if (estremi === null) return null;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('v_expenses')
    .select('booking_date')
    .gte('booking_date', estremi.da)
    .lte('booking_date', estremi.a)
    .order('booking_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { booking_date: string } | null)?.booking_date ?? null;
}
