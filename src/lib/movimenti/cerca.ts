import 'server-only';
import { cache } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { inCache } from '@/lib/supabase/cache';
import { comeArray } from '@/lib/enablebanking/redact';
import { CATEGORIA_SENZA, PER_PAGINA, type Filtri } from './filtri';

/**
 * La lettura dei movimenti.
 *
 * Chiama `cerca_movimenti()`, che restituisce le righe **e i totali
 * dell'intero insieme filtrato** nelle stesse righe. Non si sommano importi
 * qui: sommare in TypeScript la pagina che si sta mostrando darebbe il totale
 * di cinquanta righe spacciato per il totale di tutte — ed e' un errore che
 * sembra un dato.
 */

export type RigaMovimento = {
  id: string;
  booking_date: string;
  value_date: string | null;
  amount: string;
  amount_eur: string | null;
  currency: string;
  stato: string;
  esercente: string | null;
  merchant_id: string | null;
  categoria: string | null;
  category_id: string | null;
  discrezionalita: string | null;
  contesto: string | null;
  conto: string | null;
  raw_description: string | null;
  counterparty_raw: string | null;
  bank_code: string | null;
  is_transfer: boolean;
  is_refund: boolean;
  excluded_from_analysis: boolean;
  manually_categorized: boolean;
  note: string | null;
  /** `null` quando la riga E' nella spesa reale; altrimenti dice perche' non c'e'. */
  fuori_dalla_spesa: string | null;
  totale_righe: number;
  totale_importo: string | null;
};

export type Esito = {
  righe: readonly RigaMovimento[];
  /** Righe dell'intero insieme filtrato, non della pagina. */
  totaleRighe: number;
  /** Somma dell'intero insieme filtrato, come stringa decimale. */
  totaleImporto: string | null;
  pagine: number;
};

/**
 * `soloQuesta` esclude le categorie discendenti.
 *
 * Serve a un caso solo, e non e' un caso limite: nella fisarmonica un nodo con
 * delle figlie **e** della spesa propria mostra le figlie piu' una riga
 * «direttamente qui». Se quella riga scendesse al ramo intero, ogni euro
 * comparirebbe due volte — una nelle figlie e una qui.
 *
 * Predefinito falso: ogni chiamata gia' scritta si comporta come prima, e il
 * filtro per categoria continua a comprendere le discendenti, che e' quello che
 * serve a `/movimenti`.
 */
export const cercaMovimenti = cache(
  inCache(
    'movimenti-cerca',
    async (supabase: SupabaseClient, filtri: Filtri, soloQuesta = false): Promise<Esito> => {
      const { data, error } = await supabase.rpc('cerca_movimenti', {
        p_solo_questa: soloQuesta,
        p_id: null,
        p_da: filtri.da,
        p_a: filtri.a,
        p_ricerca: filtri.ricerca === '' ? null : filtri.ricerca,
        // «Senza categoria» non e' una categoria: la RPC la chiede con un flag,
        // perche' `p_categoria = null` significa gia' «tutte».
        p_categoria: filtri.categoria === CATEGORIA_SENZA ? null : filtri.categoria,
        p_senza_categoria: filtri.categoria === CATEGORIA_SENZA,
        p_merchant: filtri.merchant,
        p_discrezionalita: filtri.discrezionalita,
        p_contesto: filtri.contesto,
        p_tipo: filtri.tipo,
        p_ordine: filtri.ordine,
        p_limite: PER_PAGINA,
        p_scarto: (filtri.pagina - 1) * PER_PAGINA,
      });

      if (error !== null) throw new Error(`Ricerca movimenti fallita: ${error.message}`);

      const righe = comeArray<RigaMovimento>(data);

      // I totali stanno su ogni riga, uguali. Quando la pagina e' vuota non ci
      // sono righe da cui leggerli, e zero e' la risposta giusta: e' un insieme
      // filtrato vuoto, non un insieme di cui non si sa la somma.
      const prima = righe[0];
      const totaleRighe = prima === undefined ? 0 : Number(prima.totale_righe);

      return {
        righe,
        totaleRighe,
        totaleImporto: prima?.totale_importo ?? null,
        pagine: Math.max(1, Math.ceil(totaleRighe / PER_PAGINA)),
      };
    },
  ),
);

/**
 * Un movimento solo, per la sua scheda.
 *
 * Passa dalla stessa funzione invece di leggere `transactions` direttamente:
 * cosi' la scheda mostra esattamente i campi che la lista mostra, calcolati
 * allo stesso modo — compreso `fuori_dalla_spesa`, che e' la cosa per cui si
 * apre una scheda quando un numero non torna.
 */
export const leggiMovimento = cache(
  inCache(
    'movimenti-uno',
    async (supabase: SupabaseClient, id: string): Promise<RigaMovimento | null> => {
      const { data, error } = await supabase.rpc('cerca_movimenti', { p_id: id, p_limite: 1 });
      if (error !== null) throw new Error(`Lettura movimento fallita: ${error.message}`);

      return comeArray<RigaMovimento>(data)[0] ?? null;
    },
  ),
);

export type RigaStato = {
  connection_id: string;
  banca: string;
  stato_connessione: string;
  valid_until: string | null;
  giorni_al_rinnovo: number | null;
  ultima_sync_riuscita: string | null;
  ultima_sync_fallita: string | null;
  ultimo_errore: string | null;
  ultimo_movimento: string | null;
  movimenti_provvisori: number;
  conti_attivi: number;
};

export const leggiStatoSistema = cache(
  inCache('stato-sistema', async (supabase: SupabaseClient): Promise<readonly RigaStato[]> => {
    const { data } = await supabase.from('v_stato_sistema').select('*');
    return comeArray<RigaStato>(data);
  }),
);
