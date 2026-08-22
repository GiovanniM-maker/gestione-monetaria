import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  alberoCompleto,
  leggiEsercente,
  ricorrenzaDiEsercente,
  serieEsercente,
} from '@/lib/dove/schede';
import { centesimiDi, formattaEuro } from '@/lib/abbonamenti/formato';
import { meseDaData } from '@/lib/cruscotto/mesi';
import { estremiDelMese } from '@/lib/movimenti/filtri';
import { BOTTONE_MINORE } from '@/lib/ui/controlli';
import { leggiClassi } from '@/lib/tassonomia/classi';
import { tinteDelleClassi } from '../../grafici';
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

const ORIGINI: Record<string, string> = {
  alias: 'da un alias deterministico',
  ai: 'proposta dal modello, non ancora confermata',
  manuale: 'decisa a mano',
};

export default async function EsercentePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Le quattro letture partono insieme e stanno in `lib/dove/schede.ts`: fuori
  // dal componente perche' una lettura dentro un render non ha argomenti, e
  // senza argomenti non c'e' una chiave con cui metterla in cache — ne' un nome
  // con cui il copilota possa chiamarla.
  const [m, mensili, albero, ricorrenza, classi] = await Promise.all([
    leggiEsercente(id),
    serieEsercente(id),
    alberoCompleto(),
    ricorrenzaDiEsercente(id),
    leggiClassi(),
  ]);

  if (m === null) notFound();

  const tinte = tinteDelleClassi(classi);

  const mesi: Mensile[] = mensili.map((r) => ({
    ...r,
    mese: meseDaData(r.mese) ?? r.mese,
  }));

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
        tinta={m.discretion === null ? null : (tinte[m.discretion] ?? null)}
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
        <section className="scheda p-3 text-sec">
          <h2 className="mb-2 text-sec font-medium">Ricorrenza</h2>
          <p>
            {/* Niente piu' `as {...}` a ogni campo: la lettura torna una riga
                tipizzata, quindi il tipo lo dichiara chi legge il database e non
                chi disegna. */}
            Rilevata come <strong>{ricorrenza.tipo}</strong>, cadenza {ricorrenza.cadence}, costo
            mensile{' '}
            <strong className="tabular-nums">
              {formattaEuro(centesimiDi(ricorrenza.costo_mensile ?? '0'))}
            </strong>
            .{' '}
            {ricorrenza.nella_metrica
              ? 'Entra nel costo ricorrente.'
              : 'Non entra nel costo ricorrente.'}
          </p>
          <Link className="mt-2 inline-flex min-h-11 items-center underline" href="/abbonamenti">
            vedi tutte le ricorrenze →
          </Link>
        </section>
      )}

      <section className="scheda space-y-3 p-4">
        <h2 className="text-sec font-medium">Come si classificano le sue spese</h2>
        <Interruttore id={m.id} variabile={m.classificazione_variabile} />
      </section>

      <section className="scheda p-3">
        <h2 className="mb-2 text-sec font-medium">Classificazione</h2>
        <dl className="space-y-1 text-sec">
          <Voce nome="categoria" valore={categoria?.percorso ?? null} />
          <Voce nome="discrezionalità" valore={m.discretion} />
          <Voce nome="contesto" valore={m.context} />
          <Voce nome="abbonamento" valore={m.is_subscription ? 'sì' : 'no'} />
          <Voce nome="origine" valore={ORIGINI[m.origine ?? ''] ?? m.origine} />
        </dl>
        {m.motivazione !== null && (
          <p className="mt-2 border-t border-filo pt-2 text-min text-testo-2">{m.motivazione}</p>
        )}
        {m.origine === 'ai' && m.confermato_at === null && (
          <p className="mt-2 text-min text-attenzione">
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
