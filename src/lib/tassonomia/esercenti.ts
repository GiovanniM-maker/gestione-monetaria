import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { comeArray } from '@/lib/enablebanking/redact';

/**
 * L'elenco degli esercenti, e la dichiarazione che li divide in due.
 *
 * ---------------------------------------------------------------------------
 * Fisso o variabile
 * ---------------------------------------------------------------------------
 * `McDonald's` e' ristorazione e lo sara' sempre: la classificazione
 * dell'esercente vale per tutte le sue spese e non c'e' niente da chiedere.
 * `Amazon` no — lo stesso nome ospita un computer comprato per lavorare e una
 * sciocchezza, e la banca scrive la stessa identica riga.
 *
 * La differenza non si deduce dai dati, ed e' stato provato: `Coop` va da 1,00
 * a 91,10 € ed e' sempre spesa, `Dott` da 0,03 a 9,50 e sono sempre monopattini,
 * `Anthropic` da 5,21 a 109,80 ed e' sempre lo stesso servizio. L'importo
 * misura la variabilita' del **prezzo**, non quella dell'**intento**. L'intento
 * sta nella testa di chi ha comprato, quindi e' una dichiarazione dell'utente —
 * come `own_counterparties` in Fase 3.
 */

export type RigaEsercenteElenco = {
  id: string;
  canonical_name: string;
  category_id: string | null;
  discretion: string | null;
  is_subscription: boolean;
  origine: string | null;
  confermato_at: string | null;
  movimenti: number;
  totale: string;
  classificazione_variabile: boolean;
};

export type Filtro = 'tutti' | 'variabili' | 'fissi' | 'da_confermare' | 'senza_categoria';

/** Quanti se ne mostrano per pagina. Oltre, l'elenco non si scorre piu'. */
export const PER_PAGINA = 60;

export function filtroValido(valore: unknown): Filtro {
  const ammessi: readonly string[] = [
    'tutti',
    'variabili',
    'fissi',
    'da_confermare',
    'senza_categoria',
  ];
  const v = Array.isArray(valore) ? valore[0] : valore;
  return typeof v === 'string' && ammessi.includes(v) ? (v as Filtro) : 'tutti';
}

/**
 * Ordinati per spesa, i piu' grossi in cima.
 *
 * Non per nome: un elenco alfabetico mette in cima quello che comincia per A, e
 * su trecento esercenti la coda vale il 2% degli euro. Chi apre questa pagina
 * vuole sistemare cio' che pesa.
 */
export async function leggiEsercenti(
  filtro: Filtro,
  cerca: string | null,
  pagina: number,
): Promise<{ righe: readonly RigaEsercenteElenco[]; totale: number }> {
  const supabase = await createSupabaseServerClient();

  let q = supabase.from('v_merchant_totals').select(
    // Solo le colonne che la riga mostra. `descrizione_trovata` sono fino a
    // 300 caratteri per esercente che nessuno legge in un elenco: da sola
    // valeva meta' dei 47 KB della pagina.
    'id, canonical_name, category_id, discretion, is_subscription, origine, ' +
      'confermato_at, movimenti, totale::text, classificazione_variabile',
    { count: 'exact' },
  );

  if (filtro === 'variabili') q = q.eq('classificazione_variabile', true);
  if (filtro === 'fissi') q = q.eq('classificazione_variabile', false);
  if (filtro === 'da_confermare') q = q.is('confermato_at', null).eq('origine', 'ai');
  if (filtro === 'senza_categoria') q = q.is('category_id', null);
  if (cerca !== null && cerca.trim() !== '') {
    // `%` e `,` hanno un significato dentro un filtro PostgREST: si tolgono
    // invece di sperare che non capitino.
    q = q.ilike('canonical_name', `%${cerca.trim().replace(/[%,]/g, ' ')}%`);
  }

  const da = Math.max(0, pagina) * PER_PAGINA;
  const { data, count } = await q
    .order('totale', { ascending: true })
    .range(da, da + PER_PAGINA - 1);

  return { righe: comeArray<RigaEsercenteElenco>(data), totale: count ?? 0 };
}

export class EsercenteNonValido extends Error {}

export async function impostaVariabile(id: string, variabile: boolean): Promise<void> {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new EsercenteNonValido('Esercente non indicato.');
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('imposta_esercente_variabile', {
    p_merchant_id: id,
    p_variabile: variabile === true,
  });
  if (error !== null) throw new EsercenteNonValido(error.message);
}
