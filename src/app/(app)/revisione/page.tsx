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

export default async function RevisionePage() {
  const supabase = await createSupabaseServerClient();

  const [{ data: daFare }, { data: esercenti }, { data: categorie }] = await Promise.all([
    supabase
      .from('v_da_classificare')
      .select('etichetta, movimenti, totale::text, prima, ultima')
      .order('totale', { ascending: true })
      .limit(200),
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
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Ogni assegnazione crea un <strong>alias</strong>, non una correzione su una riga: vale per
          le occorrenze passate e per quelle future. È il motivo per cui questo lavoro finisce.
        </p>
      </div>

      <PannelloRevisione
        daClassificare={comeArray<DaClassificare>(daFare)}
        esercenti={comeArray<MerchantTotale>(esercenti)}
        categorie={comeArray<CategoryRow>(categorie)}
      />
    </div>
  );
}
