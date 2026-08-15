import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { comeArray } from '@/lib/enablebanking/redact';
import { formattaEuro, sommaCosti } from '@/lib/abbonamenti/formato';
import {
  etichettaBreve,
  etichettaMese,
  meseDaData,
  meseValido,
  quotaPercentuale,
} from '@/lib/cruscotto/mesi';
import { estremiDelMese } from '@/lib/movimenti/filtri';
import { BOTTONE_MINORE } from '@/lib/ui/controlli';
import {
  finestraDiConfronto,
  leggiVariazioniCategorie,
  leggiVariazioniEsercenti,
} from '@/lib/cruscotto/variazioni';
import { comeSiConfronta, type Variazione } from '@/lib/cruscotto/andamento';
import { Freccia } from '../../grafici';
import { CorreggiCategoria } from '../../correggi';
import { genitoriPossibili } from '@/lib/tassonomia/categorie';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Categoria' };

/**
 * La scheda di una categoria.
 *
 * Risponde a «perche' gli alimentari sono saliti»: cosa c'e' dentro questo
 * mese, e come si muove nel tempo.
 *
 * Una precisazione che vale la pena fare in schermata e non solo qui: le
 * sottocategorie e gli esercenti elencati sono quelli **appesi direttamente**
 * a questo nodo o ai suoi figli immediati, mentre il totale in cima e' il
 * roll-up dell'intero ramo. Le due cose possono non coincidere, ed e' giusto
 * cosi' — ma un elenco che non somma al suo totale, senza dirlo, e'
 * esattamente il tipo di dettaglio che fa perdere fiducia. Il collegamento ai
 * movimenti porta invece all'insieme completo, discendenti comprese.
 */

/** Quanti esercenti si mostrano su una scheda di categoria. */
const ESERCENTI_MOSTRATI = 30;

type RigaCat = {
  category_id: string;
  categoria: string;
  parent_id: string | null;
  mese: string;
  spesa: string;
  movimenti: number;
  spesa_diretta: string;
};

type RigaMerc = {
  merchant_id: string | null;
  esercente: string;
  spesa: string;
  movimenti: number;
};

function centesimi(valore: string | null): bigint {
  const { totale, nonLetti } = sommaCosti([valore]);
  return nonLetti > 0 ? 0n : totale;
}

export default async function CategoriaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const parametri = await searchParams;
  const meseChiesto = meseValido(
    Array.isArray(parametri['mese']) ? parametri['mese'][0] : parametri['mese'],
  );

  const supabase = await createSupabaseServerClient();

  const [{ data: categoria }, { data: serie }] = await Promise.all([
    supabase
      .from('categories')
      .select('id, name, parent_id, default_discretion')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('v_monthly_by_category')
      .select(
        'category_id, categoria, parent_id, mese, spesa::text, movimenti, spesa_diretta::text',
      )
      .eq('category_id', id)
      .order('mese', { ascending: false })
      .limit(18),
  ]);

  const cat = categoria as {
    id: string;
    name: string;
    parent_id: string | null;
    default_discretion: string | null;
  } | null;
  if (cat === null) notFound();

  const mesi = comeArray<RigaCat>(serie).map((r) => ({ ...r, mese: meseDaData(r.mese) ?? r.mese }));
  const mese = meseChiesto ?? mesi[0]?.mese ?? null;
  const delMese = mesi.find((r) => r.mese === mese) ?? null;

  const massimo = mesi.reduce((max, r) => {
    const v = centesimi(r.spesa);
    return v < max ? v : max;
  }, 0n);

  // Figli diretti e esercenti appesi a questo nodo, nel mese scelto.
  const [{ data: figli }, { data: esercenti }] =
    mese === null
      ? [{ data: null }, { data: null }]
      : await Promise.all([
          supabase
            .from('v_monthly_by_category')
            .select(
              'category_id, categoria, parent_id, mese, spesa::text, movimenti, spesa_diretta::text',
            )
            .eq('mese', `${mese}-01`)
            .eq('parent_id', id)
            .order('spesa', { ascending: true }),
          supabase
            .from('v_monthly_by_merchant')
            .select('merchant_id, esercente, spesa::text, movimenti')
            .eq('mese', `${mese}-01`)
            .eq('category_id', id)
            .order('spesa', { ascending: true })
            .limit(ESERCENTI_MOSTRATI),
        ]);

  // Le variazioni arrivano con la **stessa finestra** del cruscotto: scendere
  // da un numero non deve cambiare il termine di paragone, o la stessa spesa
  // mostrerebbe due percentuali diverse a due livelli di distanza.
  const finestra = mese === null ? null : (await finestraDiConfronto(mese)).finestra;
  const [variazioniCat, variazioniMerc] =
    mese === null
      ? [[], []]
      : await Promise.all([
          leggiVariazioniCategorie(mese, finestra).then((v) => v.righe),
          leggiVariazioniEsercenti(mese, finestra, ESERCENTI_MOSTRATI, id).then((v) => v.righe),
        ]);
  const perCategoria = new Map<string, Variazione>(
    variazioniCat.map((v) => [v.category_id, v as Variazione]),
  );
  const perEsercente = new Map<string, Variazione>(
    variazioniMerc.map((v) => [v.merchant_id, v as Variazione]),
  );
  const spiegaIlConfronto = comeSiConfronta(perCategoria.get(id) ?? variazioniCat[0]);

  const estremi = mese === null ? null : estremiDelMese(mese);
  const versoMovimenti =
    estremi === null
      ? `/movimenti?categoria=${id}`
      : `/movimenti?categoria=${id}&da=${estremi.da}&a=${estremi.a}`;

  return (
    <div className="space-y-6">
      <Link
        href={mese === null ? '/' : `/?mese=${mese}`}
        className="inline-flex min-h-11 items-center text-sm underline"
      >
        ← cruscotto
      </Link>

      <div>
        <h1 className="text-xl font-semibold tracking-tight">{cat.name}</h1>
        {mese !== null && <p className="mt-1 text-sm text-testo-2">{etichettaMese(mese)}</p>}
        <p className="mt-2 text-3xl font-semibold tabular-nums">
          {formattaEuro(centesimi(delMese?.spesa ?? null))}
          <Freccia riga={perCategoria.get(id)} />
        </p>
        <p className="text-xs text-testo-2">
          {delMese?.movimenti ?? 0} movimenti, sottocategorie comprese
        </p>
        {spiegaIlConfronto !== null && (
          <p className="mt-1 text-xs text-testo-2">{spiegaIlConfronto}</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Link className={BOTTONE_MINORE} href={versoMovimenti}>
          tutti i movimenti del ramo
        </Link>
      </div>

      <CorreggiCategoria
        id={cat.id}
        nome={cat.name}
        discrezionalitaPredefinita={cat.default_discretion}
        parentId={cat.parent_id}
        genitoriPossibili={await genitoriPossibili(cat.id)}
      />

      {comeArray<RigaCat>(figli).length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium">Sottocategorie</h2>
          <ul className="divide-y divide-filo">
            {comeArray<RigaCat>(figli).map((f) => (
              <li key={f.category_id}>
                <Link
                  href={`/categoria/${f.category_id}${mese === null ? '' : `?mese=${mese}`}`}
                  className="flex min-h-11 items-center justify-between gap-3 text-sm"
                >
                  <span className="min-w-0 truncate">{f.categoria}</span>
                  <span className="shrink-0 tabular-nums whitespace-nowrap">
                    {formattaEuro(centesimi(f.spesa))}
                    <Freccia riga={perCategoria.get(f.category_id)} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {comeArray<RigaMerc>(esercenti).length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium">Esercenti di questo nodo</h2>
          <p className="text-xs text-testo-2">
            Solo quelli assegnati direttamente a <strong>{cat.name}</strong>: quelli delle
            sottocategorie stanno nelle rispettive schede, e il totale in cima li comprende tutti.
          </p>
          <ul className="divide-y divide-filo">
            {comeArray<RigaMerc>(esercenti).map((e, i) => (
              <li key={`${e.merchant_id ?? 'x'}-${i}`}>
                {e.merchant_id === null ? (
                  <span className="flex min-h-11 items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">{e.esercente}</span>
                    <span className="shrink-0 tabular-nums whitespace-nowrap">
                      {formattaEuro(centesimi(e.spesa))}
                      <Freccia
                        riga={e.merchant_id === null ? undefined : perEsercente.get(e.merchant_id)}
                      />
                    </span>
                  </span>
                ) : (
                  <Link
                    href={`/esercente/${e.merchant_id}`}
                    className="flex min-h-11 items-center justify-between gap-3 text-sm"
                  >
                    <span className="min-w-0 truncate">{e.esercente}</span>
                    <span className="shrink-0 tabular-nums whitespace-nowrap">
                      {formattaEuro(centesimi(e.spesa))}
                      <Freccia
                        riga={e.merchant_id === null ? undefined : perEsercente.get(e.merchant_id)}
                      />
                    </span>
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {mesi.length > 1 && (
        <section className="space-y-2">
          <h2 className="font-medium">Mese per mese</h2>
          <ul className="space-y-1">
            {mesi.map((r) => {
              const valore = centesimi(r.spesa);
              return (
                <li key={r.mese}>
                  <Link
                    href={`/categoria/${id}?mese=${r.mese}`}
                    className="flex min-h-11 items-center gap-3 text-sm sm:min-h-0 sm:py-0.5"
                  >
                    <span
                      className={`w-12 shrink-0 text-xs sm:w-16 ${
                        r.mese === mese ? 'font-semibold' : 'text-testo-2'
                      }`}
                    >
                      {etichettaBreve(r.mese)}
                    </span>
                    <span className="h-3 flex-1 overflow-hidden rounded-sm bg-s3">
                      <span
                        className={`block h-full ${r.mese === mese ? 'bg-testo' : 'bg-testo-3'}`}
                        style={{ width: `${quotaPercentuale(valore, massimo)}%` }}
                      />
                    </span>
                    <span className="w-24 shrink-0 text-right text-xs tabular-nums sm:w-28">
                      {formattaEuro(valore)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
