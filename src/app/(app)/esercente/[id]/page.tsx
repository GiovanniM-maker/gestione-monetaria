import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { comeArray } from '@/lib/enablebanking/redact';
import { centesimiDi, formattaEuro } from '@/lib/abbonamenti/formato';
import { meseDaData } from '@/lib/cruscotto/mesi';
import { estremiDelMese } from '@/lib/movimenti/filtri';
import { BOTTONE_MINORE } from '@/lib/ui/controlli';
import { COLORE_CLASSE } from '../../grafici';
import { MesePerMese, TestataLivello } from '../../livello';
import { CorreggiEsercente } from '../../correggi';
import { Interruttore } from '../../esercenti/interruttore';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Esercente' };

/**
 * La scheda di un esercente.
 *
 * Risponde a «quanto mi costa Deliveroo», che e' una domanda che ci si fa
 * davvero e che finora richiedeva una query scritta a mano.
 *
 * Mostra anche **da dove viene la classificazione** — un alias, una proposta
 * del modello, o una decisione presa a mano — perche' una categoria sbagliata
 * si corregge solo se si sa chi l'ha messa. Le proposte del modello nascono
 * con `origine = 'ai'` e valgono subito, ma restano da confermare: qui si vede
 * quali.
 *
 * **La correzione sta qui**, non su `/revisione`: e' il posto dove si guarda il
 * numero, ed e' arrivandoci da un totale che non torna che viene voglia di
 * correggere. Sopra il pannello c'e' scritto fin dove arriva l'effetto — tutte
 * le sue spese, anche quelle dei mesi gia' chiusi — perche' e' esattamente cio'
 * che distingue questa correzione da quella della singola riga.
 */

type Mensile = { mese: string; spesa: string; movimenti: number };

type Esercente = {
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

const ORIGINI: Record<string, string> = {
  alias: 'da un alias deterministico',
  ai: 'proposta dal modello, non ancora confermata',
  manuale: 'decisa a mano',
};

export default async function EsercentePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const [{ data: riga }, { data: mensili }, { data: categorie }, { data: ricorrenza }] =
    await Promise.all([
      supabase
        .from('v_merchant_totals')
        .select(
          'id, canonical_name, category_id, discretion, context, is_subscription, origine, ' +
            'confermato_at, motivazione, movimenti, totale::text, ultima, ' +
            'classificazione_variabile',
        )
        .eq('id', id)
        .maybeSingle(),
      supabase
        .from('v_monthly_by_merchant')
        .select('mese, spesa::text, movimenti')
        .eq('merchant_id', id)
        .order('mese', { ascending: false })
        .limit(18),
      supabase
        .from('v_categorie_albero')
        .select('id, nome, percorso, archiviata')
        .order('percorso'),
      supabase
        .from('v_subscriptions')
        .select('id, tipo, cadence, costo_mensile::text, nella_metrica, status')
        .eq('merchant_id', id)
        .maybeSingle(),
    ]);

  const m = riga as Esercente | null;
  if (m === null) notFound();

  const mesi = comeArray<Mensile>(mensili).map((r) => ({
    ...r,
    mese: meseDaData(r.mese) ?? r.mese,
  }));

  const albero = comeArray<{
    id: string;
    nome: string;
    percorso: string;
    archiviata: boolean;
  }>(categorie);
  const categoria = albero.find((c) => c.id === m.category_id) ?? null;
  const sceglibili = albero
    .filter((c) => !c.archiviata)
    .map((c) => ({ id: c.id, percorso: c.percorso }));

  return (
    <div className="space-y-6">
      <TestataLivello
        ritorno={{ href: '/', testo: 'cruscotto' }}
        titolo={m.canonical_name}
        sottotitolo={`${m.movimenti} ${m.movimenti === 1 ? 'movimento' : 'movimenti'}${
          m.ultima === null ? '' : ` · ultimo il ${m.ultima}`
        }`}
        importo={centesimiDi(m.totale)}
        tinta={m.discretion === null ? null : (COLORE_CLASSE[m.discretion] ?? null)}
        nota="speso in tutto lo storico"
        azioni={
          <>
            <Link className={BOTTONE_MINORE} href={`/movimenti?esercente=${m.id}&tipo=tutti`}>
              tutti i movimenti
            </Link>
            <Link className={BOTTONE_MINORE} href="/revisione">
              tutti quelli da rivedere
            </Link>
          </>
        }
      />

      {/* Ogni mese porta ai **suoi** movimenti, non al cruscotto di quel mese
          come faceva prima: da qui la domanda e' «cosa ho comprato da loro a
          maggio», e il cruscotto la perdeva per strada. */}
      <MesePerMese
        righe={mesi.map((r) => ({ mese: r.mese, valore: centesimiDi(r.spesa) }))}
        href={(mese) => {
          const e = estremiDelMese(mese);
          return e === null
            ? `/movimenti?esercente=${m.id}&tipo=tutti`
            : `/movimenti?esercente=${m.id}&tipo=tutti&da=${e.da}&a=${e.a}`;
        }}
      />

      {ricorrenza !== null && (
        <section className="scheda p-3 text-sm">
          <h2 className="mb-2 text-sm font-medium">Ricorrenza</h2>
          <p>
            Rilevata come <strong>{(ricorrenza as { tipo: string }).tipo}</strong>, cadenza{' '}
            {(ricorrenza as { cadence: string }).cadence}, costo mensile{' '}
            <strong className="tabular-nums">
              {formattaEuro(centesimiDi((ricorrenza as { costo_mensile: string }).costo_mensile))}
            </strong>
            .{' '}
            {(ricorrenza as { nella_metrica: boolean }).nella_metrica
              ? 'Entra nel costo ricorrente.'
              : 'Non entra nel costo ricorrente.'}
          </p>
          <Link className="mt-2 inline-flex min-h-11 items-center underline" href="/abbonamenti">
            vedi tutte le ricorrenze →
          </Link>
        </section>
      )}

      <section className="scheda space-y-3 p-4">
        <h2 className="text-sm font-medium">Come si classificano le sue spese</h2>
        <Interruttore id={m.id} variabile={m.classificazione_variabile} />
      </section>

      <section className="scheda p-3">
        <h2 className="mb-2 text-sm font-medium">Classificazione</h2>
        <dl className="space-y-1 text-sm">
          <Voce nome="categoria" valore={categoria?.percorso ?? null} />
          <Voce nome="discrezionalità" valore={m.discretion} />
          <Voce nome="contesto" valore={m.context} />
          <Voce nome="abbonamento" valore={m.is_subscription ? 'sì' : 'no'} />
          <Voce nome="origine" valore={ORIGINI[m.origine ?? ''] ?? m.origine} />
        </dl>
        {m.motivazione !== null && (
          <p className="mt-2 border-t border-filo pt-2 text-xs text-testo-2">{m.motivazione}</p>
        )}
        {m.origine === 'ai' && m.confermato_at === null && (
          <p className="mt-2 text-xs text-utile">
            Questa classificazione l&rsquo;ha proposta il modello e nessuno l&rsquo;ha ancora
            confermata. Vale per i conteggi — una classificazione probabile e visibile è più utile
            di nessuna — ma è la prima da guardare se un totale sorprende.
          </p>
        )}
      </section>

      <CorreggiEsercente
        id={m.id}
        categoryId={m.category_id}
        discrezionalita={m.discretion}
        contesto={m.context}
        abbonamento={m.is_subscription}
        categorie={sceglibili}
      />
    </div>
  );
}

function Voce({ nome, valore }: { nome: string; valore: string | null }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4">
      <dt className="text-testo-2">{nome}</dt>
      <dd className="text-right">{valore ?? '—'}</dd>
    </div>
  );
}
