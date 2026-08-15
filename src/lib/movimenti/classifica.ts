import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * La classificazione di **una** riga: categoria, discrezionalita', contesto.
 *
 * `correggi_movimento` (0022) faceva gia' due terzi del lavoro ma non la
 * categoria: quando e' stata scritta, la categoria era una proprieta'
 * dell'esercente e basta. Con gli esercenti variabili non lo e' piu' — il
 * computer comprato da Amazon deve poter finire in `Elettronica` mentre il
 * resto di Amazon resta dov'e'.
 *
 * Marca `manually_categorized`: senza, la tassonomia riporterebbe la riga alla
 * categoria dell'esercente alle 05:00 del mattino dopo, e la correzione
 * durerebbe una notte.
 */

export class ClassificazioneNonValida extends Error {}

export type Classificazione = {
  id: string;
  categoriaId?: string | null;
  discrezionalita?: string | null;
  contesto?: string | null;
  note?: string | null;
};

export async function classificaMovimento(c: Classificazione): Promise<void> {
  if (typeof c.id !== 'string' || c.id.trim() === '') {
    throw new ClassificazioneNonValida('Movimento non indicato.');
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('categorizza_movimento', {
    p_id: c.id,
    p_categoria_id: c.categoriaId ?? null,
    p_discrezionalita: c.discrezionalita ?? null,
    p_contesto: c.contesto ?? null,
    p_note: c.note ?? null,
  });

  // I valori ammessi li controlla la funzione SQL, che e' anche quella che li
  // conosce: due elenchi della stessa cosa divergono, e quello in TypeScript
  // sarebbe scavalcabile da chiunque chiami la RPC per un'altra strada.
  if (error !== null) throw new ClassificazioneNonValida(error.message);
  if (data !== true) throw new ClassificazioneNonValida('Questo movimento non esiste più.');
}

/** Se le spese di questo esercente si classificano una per una. */
export async function esercenteVariabile(merchantId: string | null): Promise<boolean> {
  if (merchantId === null) return false;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('merchants')
    .select('classificazione_variabile')
    .eq('id', merchantId)
    .maybeSingle();
  return (
    (data as { classificazione_variabile: boolean } | null)?.classificazione_variabile === true
  );
}
