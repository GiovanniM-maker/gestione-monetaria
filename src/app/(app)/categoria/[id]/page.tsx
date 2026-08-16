import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { comeArray } from '@/lib/enablebanking/redact';
import { centesimiDi } from '@/lib/abbonamenti/formato';
import { etichettaMese, meseDaData, meseValido } from '@/lib/cruscotto/mesi';
import { estremiDelMese } from '@/lib/movimenti/filtri';
import { BOTTONE_MINORE } from '@/lib/ui/controlli';
import {
  finestraDiConfronto,
  leggiVariazioniCategorie,
  leggiVariazioniEsercenti,
} from '@/lib/cruscotto/variazioni';
import { comeSiConfronta, type Variazione } from '@/lib/cruscotto/andamento';
import { leggiClassi } from '@/lib/tassonomia/classi';
import { tinteDelleClassi } from '../../grafici';
import { MesePerMese, Ripartizione, TestataLivello } from '../../livello';
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

  const [{ data: categoria }, { data: serie }, classi] = await Promise.all([
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
    leggiClassi(),
  ]);

  const cat = categoria as {
    id: string;
    name: string;
    parent_id: string | null;
    default_discretion: string | null;
  } | null;
  if (cat === null) notFound();

  const tinte = tinteDelleClassi(classi);
  const mesi = comeArray<RigaCat>(serie).map((r) => ({ ...r, mese: meseDaData(r.mese) ?? r.mese }));
  const mese = meseChiesto ?? mesi[0]?.mese ?? null;
  const delMese = mesi.find((r) => r.mese === mese) ?? null;

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
    <div className="space-y-8">
      <TestataLivello
        ritorno={{ href: mese === null ? '/' : `/?mese=${mese}`, testo: 'cruscotto' }}
        titolo={cat.name}
        sottotitolo={mese === null ? null : etichettaMese(mese)}
        importo={centesimiDi(delMese?.spesa)}
        variazione={perCategoria.get(id)}
        tinta={cat.default_discretion === null ? null : (tinte[cat.default_discretion] ?? null)}
        nota={`${delMese?.movimenti ?? 0} movimenti, sottocategorie comprese${
          spiegaIlConfronto === null ? '' : ` · ${spiegaIlConfronto}`
        }`}
        azioni={
          <Link className={BOTTONE_MINORE} href={versoMovimenti}>
            tutti i movimenti del ramo
          </Link>
        }
      />

      <Ripartizione
        titolo="Sottocategorie"
        voci={comeArray<RigaCat>(figli).map((f) => ({
          chiave: f.category_id,
          etichetta: f.categoria,
          dettaglio: `${f.movimenti} ${f.movimenti === 1 ? 'movimento' : 'movimenti'}`,
          valore: centesimiDi(f.spesa),
          href: `/categoria/${f.category_id}${mese === null ? '' : `?mese=${mese}`}`,
          variazione: perCategoria.get(f.category_id),
        }))}
      />

      <Ripartizione
        titolo="Esercenti di questo nodo"
        nota={
          <>
            Solo quelli assegnati direttamente a <strong>{cat.name}</strong>: quelli delle
            sottocategorie stanno nelle rispettive schede, e il totale in cima li comprende tutti.
          </>
        }
        voci={comeArray<RigaMerc>(esercenti).map((e, i) => ({
          chiave: `${e.merchant_id ?? 'x'}-${i}`,
          etichetta: e.esercente,
          dettaglio: `${e.movimenti} ${e.movimenti === 1 ? 'movimento' : 'movimenti'}`,
          valore: centesimiDi(e.spesa),
          href: e.merchant_id === null ? null : `/esercente/${e.merchant_id}`,
          variazione: e.merchant_id === null ? undefined : perEsercente.get(e.merchant_id),
        }))}
      />

      <MesePerMese
        righe={mesi.map((r) => ({ mese: r.mese, valore: centesimiDi(r.spesa) }))}
        corrente={mese}
        href={(m) => `/categoria/${id}?mese=${m}`}
      />

      {/* La correzione sta in fondo: si apre questa scheda per **leggere** un
          numero, e si corregge solo quando quel numero non torna. */}
      <CorreggiCategoria
        id={cat.id}
        nome={cat.name}
        discrezionalitaPredefinita={cat.default_discretion}
        parentId={cat.parent_id}
        genitoriPossibili={await genitoriPossibili(cat.id)}
      />
    </div>
  );
}
