import 'server-only';
import { cache } from 'react';
import { inCache } from '@/lib/supabase/cache';
import { comeArray } from '@/lib/enablebanking/redact';

/**
 * «Di cosa e' fatto questo ramo»: la lettura che la fisarmonica fa a ogni
 * apertura.
 *
 * ---------------------------------------------------------------------------
 * Una domanda sola, per tutti i livelli
 * ---------------------------------------------------------------------------
 * Scendere dalla classe alla transazione passa per quattro livelli che pongono
 * la **stessa** domanda. Scritta quattro volte sarebbero quattro definizioni di
 * «spesa di un ramo», e il sintomo di una divergenza sarebbe il peggiore
 * possibile: un padre che non e' la somma dei suoi figli.
 *
 * Il calcolo sta in `ripartizione_dove` (0047) e qui non se ne rifa' nessun
 * pezzo. Gli importi restano **stringhe** per tutto il viaggio: PostgREST
 * serializza `numeric` come numero JSON, e un numero JSON e' un float.
 *
 * ---------------------------------------------------------------------------
 * `figli` e `spesa_diretta` decidono cosa succede al tocco successivo
 * ---------------------------------------------------------------------------
 * - `figli = 0` → sotto ci sono i movimenti, e si aprono quelli;
 * - `figli > 0` → sotto c'e' un altro livello di categorie;
 * - `spesa_diretta ≠ 0` **e** `figli > 0` → oltre alle figlie serve una riga
 *   «direttamente qui», o la somma delle figlie sarebbe minore del padre senza
 *   che niente lo dica. Quella riga scende ai movimenti del solo nodo, ed e'
 *   precisamente il caso per cui `cerca_movimenti` ha `p_solo_questa`.
 */

export type RigaRipartizione = {
  category_id: string | null;
  nome: string;
  spesa: string;
  movimenti: number;
  spesa_diretta: string;
  movimenti_diretti: number;
  figli: number;
};

export type Coordinate = {
  /** Primo giorno del mese, `YYYY-MM-01`. */
  mese: string;
  /** Slug della classe, oppure `non classificato`. `null` = tutte. */
  classe: string | null;
  contesto: string | null;
  /** Il nodo da aprire. `null` = le radici. */
  categoria: string | null;
};

export const leggiRipartizione = cache(
  inCache('ripartizione-dove', async (sb, c: Coordinate): Promise<readonly RigaRipartizione[]> => {
    const { data } = await sb.rpc('ripartizione_dove', {
      p_mese: c.mese,
      p_classe: c.classe,
      p_contesto: c.contesto,
      p_categoria: c.categoria,
    });
    return comeArray<RigaRipartizione>(data);
  }),
);
