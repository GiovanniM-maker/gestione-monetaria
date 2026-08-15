import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { comeArray } from '@/lib/enablebanking/redact';

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
};

export async function leggiDaConfermare(): Promise<readonly RigaDaConfermare[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('v_da_confermare')
    .select('*')
    .order('booking_date', { ascending: false })
    .limit(100);
  return comeArray<RigaDaConfermare>(data);
}

/** Quante ne restano da confermare. Serve al conteggio sul cruscotto. */
export async function quanteDaConfermare(): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { count } = await supabase
    .from('v_da_confermare')
    .select('id', { count: 'exact', head: true });
  return count ?? 0;
}

export class ConfermaNonValida extends Error {}

const DISCREZIONALITA = ['essenziale', 'investimento', 'utile', 'voluttuario'];
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

  if (d !== null && !DISCREZIONALITA.includes(d)) {
    throw new ConfermaNonValida(`Discrezionalita' non ammessa: ${d}`);
  }
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
export async function confermaMovimenti(ids: readonly string[]): Promise<number> {
  const puliti = ids.filter((i) => typeof i === 'string' && i.trim() !== '');
  if (puliti.length === 0) throw new ConfermaNonValida('Nessun movimento indicato.');
  if (puliti.length > 100) throw new ConfermaNonValida(`Troppi movimenti: ${puliti.length}`);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('conferma_movimenti', { p_ids: puliti });
  if (error !== null) throw new Error(`Conferma in blocco fallita: ${error.message}`);
  return typeof data === 'number' ? data : 0;
}
