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

/**
 * Un errore della RPC si LANCIA, non si ingoia.
 *
 * Trovato provando la 0050 prima di applicarla: con la funzione assente nel
 * database, `{ data }` da solo trasformava l'errore in un elenco vuoto e il
 * ramo diceva «niente qui dentro» — un guasto travestito da risposta, che e'
 * la categoria peggiore. La fisarmonica ha uno stato d'errore apposta: deve
 * riceverlo.
 */
function oDati<T>(r: { data: unknown; error: { message: string } | null }): readonly T[] {
  if (r.error !== null) throw new Error(r.error.message);
  return comeArray<T>(r.data);
}

export const leggiRipartizione = cache(
  inCache('ripartizione-dove', async (sb, c: Coordinate): Promise<readonly RigaRipartizione[]> => {
    const esito = await sb.rpc('ripartizione_dove', {
      p_mese: c.mese,
      p_classe: c.classe,
      p_contesto: c.contesto,
      p_categoria: c.categoria,
    });
    return oDati<RigaRipartizione>(esito);
  }),
);

/**
 * La stessa discesa, ristretta al costo ricorrente di un tipo.
 *
 * Somma `costo_mensile` — un tasso, la stessa colonna della metrica — e non la
 * spesa di un mese: il totale in cima alla pagina del ricorrente e i suoi rami
 * devono dire lo stesso numero. Il calcolo sta in `ripartizione_ricorrente`
 * (0050) e ha la stessa forma di `ripartizione_dove`, di proposito: la
 * fisarmonica non sa quale delle due sta disegnando.
 */
export type CoordinateRicorrente = {
  /** `abbonamento` o `abitudine`. */
  tipo: string;
  classe: string | null;
  contesto: string | null;
  categoria: string | null;
};

export const leggiRipartizioneRicorrente = cache(
  inCache(
    'ripartizione-ricorrente',
    async (sb, c: CoordinateRicorrente): Promise<readonly RigaRipartizione[]> => {
      const esito = await sb.rpc('ripartizione_ricorrente', {
        p_tipo: c.tipo,
        p_classe: c.classe,
        p_contesto: c.contesto,
        p_categoria: c.categoria,
      });
      return oDati<RigaRipartizione>(esito);
    },
  ),
);

export type RigaVoce = {
  merchant_id: string;
  esercente: string;
  costo_mensile: string | null;
  occorrenze: number;
  cadenza: string;
  stato: string;
};

/** Le voci (gli esercenti ricorrenti) sotto un nodo: il fondo di quella discesa. */
export const leggiVociRicorrenti = cache(
  inCache(
    'voci-ricorrenti',
    async (sb, c: CoordinateRicorrente & { soloQuesta: boolean }): Promise<readonly RigaVoce[]> => {
      const esito = await sb.rpc('voci_ricorrenti', {
        p_tipo: c.tipo,
        p_classe: c.classe,
        p_contesto: c.contesto,
        p_categoria: c.categoria,
        p_solo_questa: c.soloQuesta,
      });
      return oDati<RigaVoce>(esito);
    },
  ),
);
