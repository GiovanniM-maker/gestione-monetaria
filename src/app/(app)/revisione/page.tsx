import type { Metadata } from 'next';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { comeArray } from '@/lib/enablebanking/redact';
import { PannelloRevisione } from './pannello-revisione';
import type { CategoryRow } from '@/lib/db/types';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Revisione tassonomia' };

/**
 * La schermata di revisione della Fase 4.
 *
 * Il lavoro che fa e' uno solo: trasformare le etichette senza esercente in
 * dichiarazioni riutilizzabili. Ogni assegnazione crea un alias, quindi vale
 * anche per le occorrenze future — altrimenti la stessa etichetta tornerebbe
 * da classificare al prossimo sync e questa schermata sarebbe un lavoro
 * infinito invece che un lavoro che finisce.
 *
 * L'ordine di presentazione e' per spesa decrescente: la prima riga e' quella
 * che costa di piu' lasciare non classificata.
 */

type DaClassificare = {
  etichetta: string;
  movimenti: number;
  totale: string;
  prima: string;
  ultima: string;
};

type MerchantTotale = {
  id: string;
  canonical_name: string;
  category_id: string | null;
  discretion: string | null;
  context: string | null;
  is_subscription: boolean;
  movimenti: number;
  totale: string;
  ultima: string | null;
};

/**
 * Quante etichette si mostrano. Il numero vero viaggia comunque accanto: un
 * elenco tagliato che non dice di essere tagliato fa credere che il lavoro sia
 * finito quando non lo e'.
 */
const MOSTRATE = 500;

export default async function RevisionePage() {
  const supabase = await createSupabaseServerClient();

  const [{ data: daFare, count: quanteInTutto }, { data: esercenti }, { data: categorie }] =
    await Promise.all([
      supabase
        .from('v_da_classificare')
        .select('etichetta, movimenti, totale::text, prima, ultima', { count: 'exact' })
        .order('totale', { ascending: true })
        .limit(MOSTRATE),
      // Colonne esplicite e non `*`: con `*` piu' un cast della stessa colonna
      // si chiede due volte `totale`, e quale delle due vinca non e' scritto da
      // nessuna parte.
      supabase
        .from('v_merchant_totals')
        .select(
          'id, canonical_name, category_id, discretion, context, is_subscription, movimenti, totale::text, ultima',
        )
        .order('totale', { ascending: true }),
      supabase.from('categories').select('*').order('sort_order', { ascending: true }),
    ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Revisione della tassonomia</h1>
        <p className="mt-1 text-sm text-testo-2 text-testo-3">
          Ogni assegnazione crea un <strong>alias</strong>, non una correzione su una riga: vale per
          le occorrenze passate e per quelle future. È il motivo per cui questo lavoro finisce.
        </p>
      </div>

      <PannelloRevisione
        quanteInTutto={quanteInTutto ?? 0}
        daClassificare={comeArray<DaClassificare>(daFare)}
        esercenti={comeArray<MerchantTotale>(esercenti)}
        categorie={comeArray<CategoryRow>(categorie)}
      />
    </div>
  );
}
