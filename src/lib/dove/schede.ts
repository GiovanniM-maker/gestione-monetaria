import 'server-only';
import { cache } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { inCache } from '@/lib/supabase/cache';
import { comeArray } from '@/lib/enablebanking/redact';

/**
 * Le letture delle due schede in fondo alla discesa: una categoria e un
 * esercente.
 *
 * ---------------------------------------------------------------------------
 * Perche' sono uscite dalle pagine
 * ---------------------------------------------------------------------------
 * Stavano dentro `categoria/[id]/page.tsx` e `esercente/[id]/page.tsx`, come
 * chiamate al client Supabase in mezzo al componente. Due ragioni per
 * spostarle, e nessuna delle due e' l'ordine:
 *
 * 1. **Per il copilota non esistevano.** La regola della Fase 0 dice che ogni
 *    operazione dev'essere raggiungibile da lui e non solo da un bottone: una
 *    lettura dentro un componente e' esattamente cio' che la regola vieta, e la
 *    Fase 10 ha gia' pagato il conto una volta.
 * 2. **Non si potevano mettere in cache.** `inCache` vuole una funzione con
 *    argomenti espliciti, perche' sono gli argomenti a fare la chiave; una
 *    query scritta dentro il render non ne ha, e la chiave non si puo'
 *    costruire.
 *
 * Le chiavi contengono **tutto** cio' che cambia il risultato — l'identificativo
 * e il mese. Una chiave incompleta non rende l'applicazione lenta: le fa
 * mostrare i dati di luglio sotto l'intestazione di agosto.
 */

export type RigaCategoria = {
  id: string;
  name: string;
  parent_id: string | null;
  default_discretion: string | null;
};

export type RigaMensileCategoria = {
  category_id: string;
  categoria: string;
  parent_id: string | null;
  mese: string;
  spesa: string;
  movimenti: number;
  spesa_diretta: string;
};

export type RigaEsercenteDelMese = {
  /**
   * Nullabile, e non e' pignoleria: la vista aggrega anche la spesa **senza
   * esercente**, e dichiararlo `string` renderebbe morto il controllo che chi
   * disegna fa gia' — con l'effetto di un collegamento a `/esercente/null`.
   */
  merchant_id: string | null;
  esercente: string;
  spesa: string;
  movimenti: number;
};

const COLONNE_MENSILI =
  'category_id, categoria, parent_id, mese, spesa::text, movimenti, spesa_diretta::text';

export const leggiCategoria = cache(
  inCache(
    'scheda-categoria',
    async (sb: SupabaseClient, id: string): Promise<RigaCategoria | null> => {
      const { data } = await sb
        .from('categories')
        .select('id, name, parent_id, default_discretion')
        .eq('id', id)
        .maybeSingle();
      return (data as RigaCategoria | null) ?? null;
    },
  ),
);

/** Gli ultimi diciotto mesi di un ramo: e' la serie di «mese per mese». */
export const serieCategoria = cache(
  inCache(
    'scheda-categoria-serie',
    async (sb: SupabaseClient, id: string): Promise<readonly RigaMensileCategoria[]> => {
      const { data } = await sb
        .from('v_monthly_by_category')
        .select(COLONNE_MENSILI)
        .eq('category_id', id)
        .order('mese', { ascending: false })
        .limit(18);
      return comeArray<RigaMensileCategoria>(data);
    },
  ),
);

/** Le figlie dirette, nel mese scelto. Il mese sta nella chiave. */
export const figliDiCategoria = cache(
  inCache(
    'scheda-categoria-figli',
    async (
      sb: SupabaseClient,
      id: string,
      mese: string,
    ): Promise<readonly RigaMensileCategoria[]> => {
      const { data } = await sb
        .from('v_monthly_by_category')
        .select(COLONNE_MENSILI)
        .eq('mese', `${mese}-01`)
        .eq('parent_id', id)
        .order('spesa', { ascending: true });
      return comeArray<RigaMensileCategoria>(data);
    },
  ),
);

/** Gli esercenti appesi a questo nodo, nel mese scelto. */
export const esercentiDiCategoria = cache(
  inCache(
    'scheda-categoria-esercenti',
    async (
      sb: SupabaseClient,
      id: string,
      mese: string,
      limite: number,
    ): Promise<readonly RigaEsercenteDelMese[]> => {
      const { data } = await sb
        .from('v_monthly_by_merchant')
        .select('merchant_id, esercente, spesa::text, movimenti')
        .eq('mese', `${mese}-01`)
        .eq('category_id', id)
        .order('spesa', { ascending: true })
        .limit(limite);
      return comeArray<RigaEsercenteDelMese>(data);
    },
  ),
);

export type RigaEsercente = {
  id: string;
  canonical_name: string;
  category_id: string | null;
  discretion: string | null;
  context: string | null;
  is_subscription: boolean;
  classificazione_variabile: boolean;
  origine: string | null;
  confermato_at: string | null;
  motivazione: string | null;
  movimenti: number;
  totale: string;
  ultima: string | null;
};

export type RigaMensileEsercente = { mese: string; spesa: string; movimenti: number };

export type RigaRicorrenzaEsercente = {
  id: string;
  tipo: string;
  cadence: string | null;
  costo_mensile: string | null;
  nella_metrica: boolean;
  status: string;
};

export const leggiEsercente = cache(
  inCache(
    'scheda-esercente',
    async (sb: SupabaseClient, id: string): Promise<RigaEsercente | null> => {
      const { data } = await sb
        .from('v_merchant_totals')
        .select(
          'id, canonical_name, category_id, discretion, context, is_subscription, origine, ' +
            'confermato_at, motivazione, movimenti, totale::text, ultima, ' +
            'classificazione_variabile',
        )
        .eq('id', id)
        .maybeSingle();
      return (data as RigaEsercente | null) ?? null;
    },
  ),
);

export const serieEsercente = cache(
  inCache(
    'scheda-esercente-serie',
    async (sb: SupabaseClient, id: string): Promise<readonly RigaMensileEsercente[]> => {
      const { data } = await sb
        .from('v_monthly_by_merchant')
        .select('mese, spesa::text, movimenti')
        .eq('merchant_id', id)
        .order('mese', { ascending: false })
        .limit(18);
      return comeArray<RigaMensileEsercente>(data);
    },
  ),
);

/** La ricorrenza di questo esercente, se ne ha una. */
export const ricorrenzaDiEsercente = cache(
  inCache(
    'scheda-esercente-ricorrenza',
    async (sb: SupabaseClient, id: string): Promise<RigaRicorrenzaEsercente | null> => {
      const { data } = await sb
        .from('v_subscriptions')
        .select('id, tipo, cadence, costo_mensile::text, nella_metrica, status')
        .eq('merchant_id', id)
        .maybeSingle();
      return (data as RigaRicorrenzaEsercente | null) ?? null;
    },
  ),
);

/**
 * L'albero completo, archiviate comprese.
 *
 * Diverso da `categorieSceglibili()`, che le archiviate le toglie: qui serve
 * anche per **trovare** la categoria attuale di un esercente, e quella puo'
 * essere archiviata. Un elenco che la nascondesse mostrerebbe «senza categoria»
 * su un esercente che una categoria ce l'ha.
 */
export const alberoCompleto = cache(
  inCache(
    'categorie-albero-completo',
    async (
      sb: SupabaseClient,
    ): Promise<readonly { id: string; nome: string; percorso: string; archiviata: boolean }[]> => {
      const { data } = await sb
        .from('v_categorie_albero')
        .select('id, nome, percorso, archiviata')
        .order('percorso');
      return comeArray<{ id: string; nome: string; percorso: string; archiviata: boolean }>(data);
    },
  ),
);
