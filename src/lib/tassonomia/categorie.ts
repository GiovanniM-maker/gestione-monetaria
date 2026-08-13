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

export type CategoriaSceglibile = { id: string; percorso: string };

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
