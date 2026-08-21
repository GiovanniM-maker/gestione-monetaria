import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { comeArray } from '@/lib/enablebanking/redact';
import { applicaTassonomia } from './applica';

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

/**
 * La decisione che si prende su un esercente **appena comparso**.
 *
 * ---------------------------------------------------------------------------
 * Perche' e' una scrittura sola e non tre
 * ---------------------------------------------------------------------------
 * Sono tre fatti — la categoria, se le sue spese vanno tutte insieme o una per
 * una, e che qualcuno l'ha finalmente guardato — ma sono **una decisione**:
 * quella che si prende la prima volta che un nome nuovo compare in «Da
 * confermare». Spezzarla in tre chiamate vorrebbe dire poter finire con la
 * categoria messa e il resto no, cioe' con un esercente che sembra deciso e
 * ricompare da decidere il giorno dopo.
 *
 * ---------------------------------------------------------------------------
 * `variabile` non e' un dettaglio tecnico: e' la domanda
 * ---------------------------------------------------------------------------
 * «Le sue spese sono sempre dello stesso tipo?» ha due risposte, e cambiano
 * **a chi si chiede da qui in avanti**:
 *
 *   no  -> la categoria dell'esercente vale per tutte le sue spese, passate e
 *          future, e la conferma di fine giornata non ha piu' niente da
 *          chiedere su di lui;
 *   si' -> la categoria e' il punto di partenza, e ogni spesa resta da
 *          confermare. E' il caso Euronics: lo stesso nome ospita un computer
 *          comprato per lavorare e una sciocchezza.
 *
 * In tutti e due i casi la categoria **si propaga subito** alle spese gia'
 * registrate che nessuno ha corretto a mano: e' cio' che la rende una risposta
 * utile invece di una preferenza per il futuro.
 *
 * ---------------------------------------------------------------------------
 * `confermato_at` chiude il giro
 * ---------------------------------------------------------------------------
 * Senza, la domanda tornerebbe identica domani: e' proprio quel campo a dire
 * «questo l'ha guardato una persona». `origine` passa da `ai` a `utente` per
 * la stessa ragione — una classificazione proposta dal modello e poi
 * confermata non e' piu' una proposta, e continuare a chiamarla cosi'
 * significherebbe metterla in dubbio per sempre.
 */
export type DecisioneEsercente = {
  id: string;
  categoriaId: string | null;
  /** `true` = le sue spese si classificano una per una. */
  variabile: boolean;
};

export async function decidiEsercente(d: DecisioneEsercente): Promise<void> {
  if (typeof d.id !== 'string' || d.id.trim() === '') {
    throw new EsercenteNonValido('Esercente non indicato.');
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('merchants')
    .update({
      category_id: d.categoriaId,
      classificazione_variabile: d.variabile === true,
      confermato_at: new Date().toISOString(),
      origine: 'utente',
    })
    .eq('id', d.id)
    .select('id');

  if (error !== null) throw new EsercenteNonValido(error.message);
  // `false` significa «quell'esercente non esiste piu'», che chi chiama deve
  // poter distinguere da «fatto»: senza, la schermata direbbe di aver deciso
  // qualcosa su niente.
  if (comeArray<{ id: string }>(data).length === 0) {
    throw new EsercenteNonValido('Questo esercente non esiste più.');
  }

  // La categoria vive sull'esercente ma va riscritta su ogni sua transazione,
  // o gli aggregati continuerebbero a usare quella vecchia. Le righe corrette
  // a mano restano dove sono: e' il patto di `manually_categorized`.
  await applicaTassonomia();
}
