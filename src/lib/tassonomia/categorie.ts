import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { comeArray } from '@/lib/enablebanking/redact';
import { DISCREZIONALITA } from './interpreta';
import type { Discretion } from '@/lib/db/types';

/**
 * Correggere una categoria: nome, discrezionalita' predefinita, genitore.
 *
 * Era l'unico dei tre livelli della discesa che non avesse un'operazione
 * nominata: si potevano **creare** categorie (`crea_categoria`, 0026) e non
 * correggerle — nemmeno da un bottone. La `0037` colma la lacuna, e questo
 * modulo e' la firma esplicita che la regola della Fase 0 chiede, quella che
 * la schermata chiama esattamente come la chiamera' il copilot.
 */

export class CategoriaNonValida extends Error {}

export type AggiornamentoCategoria = {
  id: string;
  nome?: string | null;
  discrezionalita?: string | null;
  /**
   * Il genitore nuovo. Vale **solo** se `cambiaPadre` e' vero, perche' con la
   * sola convenzione «nullo = non cambiare» portare una categoria alla radice
   * sarebbe la stessa chiamata di «lascia com'e'».
   */
  parentId?: string | null;
  cambiaPadre?: boolean;
};

export async function aggiornaCategoria(a: AggiornamentoCategoria): Promise<void> {
  if (typeof a.id !== 'string' || a.id.trim() === '') {
    throw new CategoriaNonValida('Categoria non indicata.');
  }

  const nome = typeof a.nome === 'string' ? a.nome.trim() : null;
  if (nome !== null && nome === '') {
    throw new CategoriaNonValida('Il nome non puo’ essere vuoto.');
  }

  const d = a.discrezionalita ?? null;
  if (d !== null && !DISCREZIONALITA.includes(d as Discretion)) {
    throw new CategoriaNonValida(`Discrezionalità non ammessa: ${d}`);
  }

  const cambiaPadre = a.cambiaPadre === true;
  const parentId = cambiaPadre ? (a.parentId ?? null) : null;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('aggiorna_categoria', {
    p_id: a.id,
    p_nome: nome,
    p_discrezionalita: d,
    p_parent_id: parentId,
    p_cambia_padre: cambiaPadre,
  });

  // Tutto cio' che la funzione rifiuta e' un problema dell'input — un ciclo,
  // una discrezionalita' inventata — e il suo messaggio e' gia' scritto per
  // essere letto. Riscriverlo qui vorrebbe dire tenerne due versioni.
  if (error !== null) throw new CategoriaNonValida(error.message);
  if (data !== true) throw new CategoriaNonValida('Questa categoria non esiste più.');
}

/**
 * Crea una categoria, di primo o di secondo livello.
 *
 * Lo slug lo costruisce `crea_categoria` (0026) e non lo si chiede a chi
 * chiama: e' un dettaglio dello schema, e uno slug scelto male resta li' per
 * sempre. Rieseguire non duplica — un tocco ripetuto su un telefono non deve
 * creare «Ristoranti» due volte.
 */
export async function creaCategoria(
  nome: string,
  padreId: string | null,
  discrezionalita: string | null,
): Promise<string> {
  const n = typeof nome === 'string' ? nome.trim() : '';
  if (n === '') throw new CategoriaNonValida('Il nome non puo’ essere vuoto.');
  if (discrezionalita !== null && !DISCREZIONALITA.includes(discrezionalita as Discretion)) {
    throw new CategoriaNonValida(`Discrezionalità non ammessa: ${discrezionalita}`);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('crea_categoria', {
    p_nome: n,
    p_padre_id: padreId,
    p_discrezionalita: discrezionalita,
  });
  if (error !== null) throw new CategoriaNonValida(error.message);
  return String(data);
}

/**
 * Elimina una categoria, dichiarando dove va il suo contenuto.
 *
 * `spostaSu` nullo significa «al genitore», che e' quasi sempre giusto:
 * eliminando `Casa > Bollette` le sue spese risalgono in `Casa` e restano
 * nell'albero. Su una radice con del contenuto la funzione SQL si ferma e lo
 * dice, invece di scollegare centinaia di movimenti in silenzio.
 */
export async function eliminaCategoria(id: string, spostaSu: string | null): Promise<void> {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new CategoriaNonValida('Categoria non indicata.');
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('elimina_categoria', {
    p_id: id,
    p_sposta_su: spostaSu,
  });
  if (error !== null) throw new CategoriaNonValida(error.message);
  if (data !== true) throw new CategoriaNonValida('Questa categoria non esiste più.');
}

export type CategoriaSceglibile = { id: string; percorso: string };

/** L'albero con quanto pesa ogni nodo: serve a sapere cosa si sta eliminando. */
export type NodoAlbero = {
  id: string;
  parent_id: string | null;
  nome: string;
  percorso: string;
  profondita: number;
  discrezionalita_predefinita: string | null;
  archiviata: boolean;
  /**
   * `null` quando `v_categorie_uso` non risponde.
   *
   * Non zero: uno zero e' una risposta — «qui non c'e' niente» — e sarebbe una
   * bugia detta con sicurezza proprio davanti al bottone che elimina. La
   * schermata mostra un trattino e lo dice.
   */
  esercenti: number | null;
  movimenti: number | null;
};

/**
 * L'albero, con quanto sta appeso **direttamente** a ogni nodo.
 *
 * Diretto e non con il roll-up, di proposito: e' cio' che si sposta eliminando
 * quel nodo, ed e' la domanda a cui serve rispondere prima di premere. La spesa
 * dell'intero ramo la dice gia' il cruscotto.
 *
 * I conteggi arrivano da `v_categorie_uso` (0039). Prima si scaricavano 1.323
 * righe di `v_expenses` e 300 di `merchants` — **74 KB** — per contarle in un
 * ciclo e scriverne sessantasei. Le aggregazioni si fanno in SQL: e' la regola
 * di CLAUDE.md, e qui era anche il quarto di secondo piu' facile da togliere.
 */
export async function leggiAlbero(): Promise<readonly NodoAlbero[]> {
  const supabase = await createSupabaseServerClient();
  const [{ data: albero }, { data: uso, error }] = await Promise.all([
    supabase.from('v_categorie_albero').select('*').order('percorso'),
    supabase.from('v_categorie_uso').select('id, esercenti, movimenti'),
  ]);

  // Se la vista non risponde — migration non ancora applicata — i conteggi
  // restano `null`. Zero direbbe «vuota» a una categoria piena, e lo direbbe
  // accanto al bottone «elimina».
  const conteggi =
    error !== null
      ? null
      : new Map(
          comeArray<{ id: string; esercenti: number; movimenti: number }>(uso).map((r) => [
            r.id,
            r,
          ]),
        );

  return comeArray<Omit<NodoAlbero, 'esercenti' | 'movimenti'>>(albero).map((c) => ({
    ...c,
    esercenti: conteggi === null ? null : (conteggi.get(c.id)?.esercenti ?? 0),
    movimenti: conteggi === null ? null : (conteggi.get(c.id)?.movimenti ?? 0),
  }));
}

/**
 * Le categorie che possono fare da genitore a `id`.
 *
 * Se stessa e le proprie discendenti restano fuori: appendere un ramo sotto una
 * sua figlia creerebbe un ciclo, e la `0037` lo rifiuta. Toglierle dall'elenco
 * non sostituisce quel controllo — lo tiene lontano dallo schermo, che e' la
 * differenza fra un'opzione che non c'e' e un errore da leggere.
 */
export async function genitoriPossibili(id: string): Promise<readonly CategoriaSceglibile[]> {
  const supabase = await createSupabaseServerClient();
  const [{ data: albero }, { data: sotto }] = await Promise.all([
    supabase.from('v_categorie_albero').select('id, percorso, archiviata').order('percorso'),
    supabase.from('v_albero_categorie').select('discendente').eq('antenato', id),
  ]);

  const escluse = new Set(comeArray<{ discendente: string }>(sotto).map((r) => r.discendente));
  escluse.add(id);

  return comeArray<{ id: string; percorso: string; archiviata: boolean }>(albero)
    .filter((c) => !c.archiviata && !escluse.has(c.id))
    .map((c) => ({ id: c.id, percorso: c.percorso }));
}
