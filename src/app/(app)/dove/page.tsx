import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { RigaCategoria } from '@/lib/cruscotto/leggi';
import {
  leggiCategorie,
  leggiEsercenti,
  leggiVariazioni,
  scegliMese,
} from '@/lib/cruscotto/letture';
import { etichettaMese, meseValido, quotaPercentuale } from '@/lib/cruscotto/mesi';
import type { Variazione } from '@/lib/cruscotto/andamento';
import { centesimiDi, formattaEuro } from '@/lib/abbonamenti/formato';
import { estremiDelMese } from '@/lib/movimenti/filtri';
import { BOTTONE_MINORE } from '@/lib/ui/controlli';
import { Ciambella, fetteDellaCiambella, Freccia, type FettaCategoria } from '../grafici';
import { MesePerMese, Ripartizione } from '../livello';
import { TestataPagina } from '../testata';
import { ScheletroCiambella, ScheletroElenco } from '../scheletri';
import { SceltaMese } from '../mese';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Dove' };

/**
 * «Dove sono finiti i soldi».
 *
 * ---------------------------------------------------------------------------
 * Perche' esiste, e perche' non stava gia' sul cruscotto
 * ---------------------------------------------------------------------------
 * Stava. Il cruscotto rispondeva a **sei domande** una sotto l'altra — quanto
 * ho speso, quanto torna ogni mese, come si muove nel tempo, in cosa, da chi,
 * e c'e' qualcosa che non va — e cinque schermate di scorrimento sono il modo
 * piu' sicuro di non far leggere nessuna delle sei.
 *
 * Le quattro schede in basso sono quattro **domande**, e due di quelle
 * domande stavano nella stessa pagina. Qui c'e' la seconda, per intero: in
 * cosa e' finito il mese, da chi, come si muove nel tempo, e l'albero
 * completo per chi vuole scendere.
 *
 * Il cruscotto resta con cio' che si guarda **in dieci secondi**: quanto,
 * come si divide, quanto di quello torna ogni mese, e cosa c'e' da fare oggi.
 *
 * Il mese sta nell'indirizzo (`/dove?mese=2026-07`) come sul cruscotto: la
 * pagina resta un componente server, e passando da una scheda all'altra il
 * mese si porta dietro.
 */

const MESI_ANDAMENTO = 12;

export default async function DovePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parametri = await searchParams;
  const { mese, totali, rigaMese, mesePrecedente, meseSuccessivo, inCorso } = await scegliMese(
    meseValido(parametri['mese']),
  );

  const andamento = totali.slice(-MESI_ANDAMENTO);
  const periodo = estremiDelMese(mese);
  const versoMovimenti =
    periodo === null ? '/movimenti' : `/movimenti?da=${periodo.da}&a=${periodo.a}`;

  return (
    <div className="space-y-8">
      <SceltaMese
        mese={mese}
        precedente={mesePrecedente}
        successivo={meseSuccessivo}
        inCorso={inCorso}
        indirizzo={(m) => `/dove?mese=${m}`}
      />

      <TestataPagina
        titolo="Dove"
        cifra={formattaEuro(centesimiDi(rigaMese?.spesa))}
        etichetta={`speso in ${etichettaMese(mese)}${
          rigaMese === null ? '' : ` · ${rigaMese.movimenti} movimenti`
        }`}
        azioni={
          <Link className={BOTTONE_MINORE} href={versoMovimenti}>
            tutti i movimenti del mese
          </Link>
        }
      />

      <Suspense fallback={<ScheletroCiambella />}>
        <InCosa mese={mese} />
      </Suspense>

      <Suspense fallback={<ScheletroElenco />}>
        <DaChi mese={mese} />
      </Suspense>

      <MesePerMese
        titolo="Mese per mese"
        righe={andamento.map((r) => ({ mese: r.mese, valore: centesimiDi(r.spesa) }))}
        corrente={mese}
        href={(m) => `/dove?mese=${m}`}
      />

      <Suspense fallback={null}>
        <AlberoIntero mese={mese} />
      </Suspense>
    </div>
  );
}

async function InCosa({ mese }: { mese: string }) {
  const [categorie, variazioni] = await Promise.all([leggiCategorie(mese), leggiVariazioni(mese)]);
  if (categorie.length === 0) return null;

  const perCategoria = new Map(variazioni.categorie.map((v) => [v.category_id, v as Variazione]));

  // Solo le **radici**: con il roll-up la loro somma e' la spesa categorizzata
  // del mese, esattamente una volta. Mettendoci anche le figlie ogni euro
  // comparirebbe due volte e il giro non vorrebbe piu' dire niente.
  const radici: FettaCategoria[] = categorie
    .filter((c) => c.parent_id === null)
    .map((c) => ({
      chiave: c.category_id,
      etichetta: c.categoria,
      valore: centesimiDi(c.spesa),
      href: `/categoria/${c.category_id}?mese=${mese}`,
      variazione: perCategoria.get(c.category_id),
    }))
    .filter((f) => f.valore !== 0n);
  if (radici.length === 0) return null;

  const inCategoria = radici.reduce((s, r) => s + r.valore, 0n);

  return (
    <section className="space-y-3">
      <h2 className="text-[17px] font-semibold tracking-[-0.02em]">In cosa</h2>
      <div className="scheda p-4">
        <Ciambella voci={fetteDellaCiambella(radici)} totale={inCategoria} />
      </div>
    </section>
  );
}

async function DaChi({ mese }: { mese: string }) {
  const [esercenti, variazioni] = await Promise.all([leggiEsercenti(mese), leggiVariazioni(mese)]);
  if (esercenti.length === 0) return null;

  const perEsercente = new Map(variazioni.esercenti.map((v) => [v.merchant_id, v as Variazione]));

  return (
    <Ripartizione
      titolo="Da chi"
      voci={esercenti.map((e, i) => ({
        chiave: `${e.merchant_id ?? 'nessuno'}-${e.discrezionalita}-${i}`,
        etichetta: e.esercente,
        dettaglio: `${e.movimenti} ${e.movimenti === 1 ? 'movimento' : 'movimenti'} · ${e.discrezionalita}`,
        valore: centesimiDi(e.spesa),
        href: e.merchant_id === null ? null : `/esercente/${e.merchant_id}`,
        variazione: e.merchant_id === null ? undefined : perEsercente.get(e.merchant_id),
      }))}
    />
  );
}

async function AlberoIntero({ mese }: { mese: string }) {
  const [categorie, variazioni] = await Promise.all([leggiCategorie(mese), leggiVariazioni(mese)]);
  if (categorie.length === 0) return null;

  const perCategoria = new Map(variazioni.categorie.map((v) => [v.category_id, v as Variazione]));
  const totale = categorie
    .filter((c) => c.parent_id === null)
    .reduce((s, c) => s + centesimiDi(c.spesa), 0n);

  return (
    // Chiuso: e' un inventario, non una risposta. Aperto era meta' schermata.
    <details>
      <summary className="inline-flex min-h-11 cursor-pointer items-center text-[15px] font-medium text-testo-2">
        L&rsquo;albero intero ›
      </summary>
      <p className="mb-2 text-[13px] text-testo-3">
        Ogni categoria porta la somma delle sue sottocategorie. Dove compare una seconda cifra,
        &egrave; la parte finita direttamente su quel nodo invece che in un figlio.
      </p>
      <div className="scheda px-4">
        <Albero righe={categorie} totale={totale} mese={mese} variazioni={perCategoria} />
      </div>
    </details>
  );
}

/**
 * L'albero delle categorie.
 *
 * Si disegna dai `parent_id` invece di leggere una profondita' precalcolata:
 * una categoria il cui padre non ha spesa in questo mese non compare fra le
 * righe, e appesa a un livello che non esiste sparirebbe dal totale visibile
 * pur essendo nella somma. Qui invece risale come radice.
 */
function Albero({
  righe,
  totale,
  mese,
  variazioni,
}: {
  righe: readonly RigaCategoria[];
  totale: bigint;
  mese: string;
  variazioni: ReadonlyMap<string, Variazione>;
}) {
  const presenti = new Set(righe.map((r) => r.category_id));
  const figli = new Map<string | null, RigaCategoria[]>();

  for (const r of righe) {
    const padre = r.parent_id !== null && presenti.has(r.parent_id) ? r.parent_id : null;
    const gruppo = figli.get(padre);
    if (gruppo === undefined) figli.set(padre, [r]);
    else gruppo.push(r);
  }

  function rami(padre: string | null, livello: number): React.ReactNode[] {
    const gruppo = figli.get(padre) ?? [];
    return gruppo.flatMap((r) => {
      const valore = centesimiDi(r.spesa);
      const diretta = centesimiDi(r.spesa_diretta);
      return [
        <li key={r.category_id}>
          <Link
            href={`/categoria/${r.category_id}?mese=${mese}`}
            className="flex min-h-12 items-center gap-3 py-1.5 text-[15px]"
            style={{ paddingLeft: `${livello * 14}px` }}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate">{r.categoria}</span>
              <span className="mt-1 flex items-center gap-2">
                <span className="h-1 w-16 shrink-0 overflow-hidden rounded-full bg-s3">
                  <span
                    className="block h-full rounded-full bg-(--testo-3)"
                    style={{ width: `${quotaPercentuale(valore, totale)}%` }}
                  />
                </span>
                <span className="cifra truncate text-[12px] text-testo-3">
                  {r.movimenti} mov.
                  {diretta !== valore && diretta !== 0n && ` · ${formattaEuro(diretta)} qui`}
                </span>
              </span>
            </span>
            <span className="cifra shrink-0 whitespace-nowrap">
              {formattaEuro(valore)}
              <Freccia riga={variazioni.get(r.category_id)} />
            </span>
            <span aria-hidden="true" className="shrink-0 text-testo-3">
              ›
            </span>
          </Link>
        </li>,
        ...rami(r.category_id, livello + 1),
      ];
    });
  }

  return <ul className="elenco">{rami(null, 0)}</ul>;
}
