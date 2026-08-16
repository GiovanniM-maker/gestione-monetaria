import type { Metadata } from 'next';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { comeArray } from '@/lib/enablebanking/redact';
import { PannelloRevisione } from './pannello-revisione';
import type { CategoryRow } from '@/lib/db/types';
import { centesimiDi, formattaEuro } from '@/lib/abbonamenti/formato';
import { conta, TestataPagina } from '../testata';

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

  // Quanto vale lasciare tutto com'e': la somma delle etichette scoperte che
  // si stanno mostrando. Non e' il totale di tutte — se ce ne sono piu' di
  // quante ne vediamo, e' quanto valgono **le piu' care**, che e' la cifra su
  // cui si decide se vale la pena aprire questa schermata oggi.
  const scoperto = comeArray<DaClassificare>(daFare).reduce(
    (s, v) => s + centesimiDi(v.totale),
    0n,
  );
  const quantiEsercenti = comeArray<MerchantTotale>(esercenti).length;

  return (
    <div className="space-y-6">
      <TestataPagina
        titolo="Revisione"
        cifra={conta(quanteInTutto ?? 0)}
        etichetta="etichette senza un esercente"
        tinta={(quanteInTutto ?? 0) === 0 ? 'var(--conferma)' : 'var(--attenzione)'}
        figure={[
          { valore: formattaEuro(scoperto), etichetta: 'quanto valgono' },
          { valore: conta(quantiEsercenti), etichetta: 'esercenti in tutto' },
        ]}
        perche={
          <p>
            Ogni assegnazione crea un <strong>alias</strong>, non una correzione su una riga: vale
            per le occorrenze passate e per quelle future. È il motivo per cui questo lavoro
            finisce, invece di ricominciare a ogni sincronizzazione.
          </p>
        }
      />

      <PannelloRevisione
        quanteInTutto={quanteInTutto ?? 0}
        daClassificare={comeArray<DaClassificare>(daFare)}
        esercenti={comeArray<MerchantTotale>(esercenti)}
        categorie={comeArray<CategoryRow>(categorie)}
      />
    </div>
  );
}
