import type { Metadata } from 'next';
import Link from 'next/link';
import { leggiCruscotto } from '@/lib/cruscotto/leggi';
import type { RigaCategoria, RigaClasse, RigaTotaleMese } from '@/lib/cruscotto/leggi';
import {
  etichettaBreve,
  etichettaMese,
  meseValido,
  quotaPercentuale,
  variazione,
} from '@/lib/cruscotto/mesi';
import { formattaEuro, ordinaPerPeso, sommaCosti, totalePerTipo } from '@/lib/abbonamenti/formato';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Cruscotto' };

/**
 * Il cruscotto.
 *
 * L'ordine dei blocchi e' l'ordine delle domande, non quello di importanza
 * grafica: **quanto ho speso**, **quanto di quello torna ogni mese**, **come si
 * muove nel tempo**, **in cosa**, **da chi**. Ogni blocco successivo spiega il
 * precedente, e si scende finche' la risposta e' azionabile.
 *
 * Il mese sta nell'indirizzo (`/?mese=2026-07`) e non in uno stato del
 * browser. Cosi' la pagina resta un componente server — nessun aggregato
 * attraversa la rete per essere ricalcolato in JavaScript — e un mese si puo'
 * mandare a se stessi come collegamento.
 */

/** Quanti mesi mostra l'andamento. Un anno e' il minimo per vedere una stagione. */
const MESI_ANDAMENTO = 12;

const COLORI: Record<string, string> = {
  essenziale: 'bg-sky-500',
  investimento: 'bg-emerald-500',
  utile: 'bg-amber-500',
  voluttuario: 'bg-rose-500',
};

function centesimi(valore: string | null): bigint {
  const { totale, nonLetti } = sommaCosti([valore]);
  return nonLetti > 0 ? 0n : totale;
}

function sommaClassi(righe: readonly RigaClasse[]): bigint {
  return righe.reduce((s, r) => s + centesimi(r.spesa), 0n);
}

export default async function CruscottoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parametri = await searchParams;
  const dati = await leggiCruscotto(meseValido(parametri['mese']));

  const {
    mese,
    mesePrecedente,
    mesiDisponibili,
    totali,
    classi,
    classiPrecedenti,
    categorie,
    esercenti,
    ricorrente,
  } = dati;

  const indice = mesiDisponibili.indexOf(mese);
  const meseSuccessivo = indice >= 0 ? (mesiDisponibili[indice + 1] ?? null) : null;

  const rigaMese = totali.find((t) => t.mese === mese) ?? null;
  const speso = sommaClassi(classi);
  const spesoPrima = sommaClassi(classiPrecedenti);
  const scostamento = mesePrecedente === null ? null : variazione(speso, spesoPrima);

  const vociRicorrenti = ordinaPerPeso(ricorrente);
  const abbonamenti = totalePerTipo(vociRicorrenti, 'abbonamento');
  const abitudini = totalePerTipo(vociRicorrenti, 'abitudine');

  const andamento = totali.slice(-MESI_ANDAMENTO);
  const piuAlto = andamento.reduce((max, r) => {
    const v = centesimi(r.spesa);
    return v < max ? v : max;
  }, 0n);

  // Solo i mesi civili sono un mese vero: l'ultimo disponibile e' quasi sempre
  // in corso, e confrontarlo con un mese intero fa sembrare che la spesa sia
  // crollata.
  const inCorso = mese === mesiDisponibili[mesiDisponibili.length - 1];

  return (
    <div className="space-y-10">
      {/* ---------------------------------------------------------------- */}
      {/* IL MESE                                                          */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">
          {etichettaMese(mese)}
          {inCorso && (
            <span className="ml-2 align-middle text-xs font-normal text-neutral-500">
              mese in corso
            </span>
          )}
        </h1>
        <nav className="flex gap-3 text-sm">
          {mesePrecedente !== null && (
            <Link
              className="inline-flex min-h-11 items-center text-neutral-600 hover:underline sm:min-h-0 dark:text-neutral-400"
              href={`/?mese=${mesePrecedente}`}
            >
              ← {etichettaMese(mesePrecedente)}
            </Link>
          )}
          {meseSuccessivo !== null && (
            <Link
              className="inline-flex min-h-11 items-center text-neutral-600 hover:underline sm:min-h-0 dark:text-neutral-400"
              href={`/?mese=${meseSuccessivo}`}
            >
              {etichettaMese(meseSuccessivo)} →
            </Link>
          )}
        </nav>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* QUANTO HO SPESO                                                  */}
      {/* ---------------------------------------------------------------- */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-baseline gap-3">
          <p className="text-3xl font-semibold tabular-nums sm:text-4xl">{formattaEuro(speso)}</p>
          {scostamento !== null && (
            <p className="text-sm text-neutral-500">
              {scostamento > 0 ? '+' : ''}
              {scostamento.toFixed(1).replace('.', ',')}% su {etichettaMese(mesePrecedente ?? '')}
              {inCorso && ', ma il mese non è finito'}
            </p>
          )}
        </div>

        {classi.length === 0 ? (
          <p className="text-sm text-neutral-500">Nessun movimento in questo mese.</p>
        ) : (
          <ul className="space-y-2">
            {classi.map((c) => {
              const valore = centesimi(c.spesa);
              const prima = classiPrecedenti.find(
                (p) => p.discrezionalita === c.discrezionalita && p.contesto === c.contesto,
              );
              const delta = prima === undefined ? null : variazione(valore, centesimi(prima.spesa));
              return (
                <li key={`${c.discrezionalita}-${c.contesto}`} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span>
                      {c.discrezionalita}
                      <span className="text-neutral-500"> · {c.contesto}</span>
                    </span>
                    <span className="tabular-nums">
                      {formattaEuro(valore)}
                      {delta !== null && (
                        <span className="ml-2 text-xs text-neutral-500">
                          {delta > 0 ? '+' : ''}
                          {delta.toFixed(0)}%
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                    <div
                      className={`h-full ${COLORI[c.discrezionalita] ?? 'bg-neutral-400'}`}
                      style={{ width: `${quotaPercentuale(valore, speso)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {rigaMese !== null && (rigaMese.senza_cambio > 0 || rigaMese.senza_categoria > 0) && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            {rigaMese.senza_cambio > 0 && (
              <>
                <strong>{rigaMese.senza_cambio}</strong> movimenti in valuta senza tasso di cambio{' '}
                <strong>non sono nel totale</strong>: convertirli a runtime darebbe due numeri
                diversi in due schermate.{' '}
              </>
            )}
            {rigaMese.senza_categoria > 0 && (
              <>
                <strong>{rigaMese.senza_categoria}</strong> movimenti per{' '}
                {formattaEuro(centesimi(rigaMese.spesa_senza_categoria))} sono nel totale ma non in
                nessuna categoria.{' '}
                <Link className="underline" href="/revisione">
                  Assegnali
                </Link>
                .
              </>
            )}
          </p>
        )}
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* QUANTO DI QUESTO TORNA OGNI MESE                                 */}
      {/* ---------------------------------------------------------------- */}
      <section className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="font-medium">Di questo, quanto torna ogni mese</h2>
          <Link
            className="inline-flex min-h-11 items-center text-xs text-neutral-500 hover:underline sm:min-h-0"
            href="/abbonamenti"
          >
            dettaglio →
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
            <p className="text-xs uppercase tracking-wide text-neutral-500">Abbonamenti</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{formattaEuro(abbonamenti)}</p>
            <p className="mt-1 text-xs text-neutral-500">Si disdicono. Il risparmio è certo.</p>
          </div>
          <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
            <p className="text-xs uppercase tracking-wide text-neutral-500">Abitudini</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{formattaEuro(abitudini)}</p>
            <p className="mt-1 text-xs text-neutral-500">
              Niente da disdire: si ripete perché lo si rifà.
            </p>
          </div>
        </div>
        <p className="text-xs text-neutral-500">
          Sono tassi calcolati su tutto lo storico, non su {etichettaMese(mese)}: dicono quanto
          costa ciò che si ripete, non quanto è uscito questo mese. Non si sommano fra loro perché
          suggeriscono due azioni diverse.
        </p>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* COME SI MUOVE                                                    */}
      {/* ---------------------------------------------------------------- */}
      {andamento.length > 1 && (
        <section className="space-y-2">
          <h2 className="font-medium">Andamento</h2>
          <ul className="space-y-1">
            {andamento.map((r) => (
              <Andamento key={r.mese} riga={r} massimo={piuAlto} corrente={r.mese === mese} />
            ))}
          </ul>
        </section>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* IN COSA                                                          */}
      {/* ---------------------------------------------------------------- */}
      {categorie.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium">In cosa</h2>
          <p className="text-xs text-neutral-500">
            Ogni categoria porta la somma delle sue sottocategorie. Dove la cifra fra parentesi
            compare, è la parte finita direttamente su quel nodo invece che in un figlio.
          </p>
          <Albero righe={categorie} totale={speso} />
        </section>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* DA CHI                                                           */}
      {/* ---------------------------------------------------------------- */}
      {esercenti.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium">Da chi</h2>
          <ul className="space-y-1 text-sm">
            {esercenti.map((e, i) => {
              const valore = centesimi(e.spesa);
              return (
                <li
                  key={`${e.merchant_id ?? 'nessuno'}-${e.discrezionalita}-${i}`}
                  className="flex items-baseline justify-between gap-3 border-b border-neutral-100 py-1 dark:border-neutral-900"
                >
                  <span>
                    {e.esercente}
                    <span className="ml-2 text-xs text-neutral-500">
                      {e.movimenti} {e.movimenti === 1 ? 'movimento' : 'movimenti'} ·{' '}
                      {e.discrezionalita}
                    </span>
                  </span>
                  <span className="tabular-nums whitespace-nowrap">{formattaEuro(valore)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

function Andamento({
  riga,
  massimo,
  corrente,
}: {
  riga: RigaTotaleMese;
  massimo: bigint;
  corrente: boolean;
}) {
  const valore = centesimi(riga.spesa);
  return (
    <li>
      {/* Tutta la riga e' il bersaglio, non la sola etichetta del mese: quattro
          caratteri alti sedici pixel si sbagliano col pollice, una riga alta
          quarantaquattro no. */}
      <Link
        href={`/?mese=${riga.mese}`}
        className="flex min-h-11 items-center gap-3 text-sm sm:min-h-0 sm:py-0.5"
      >
        <span
          className={`w-12 shrink-0 text-xs sm:w-16 ${
            corrente ? 'font-semibold' : 'text-neutral-500'
          }`}
        >
          {etichettaBreve(riga.mese)}
        </span>
        <span className="h-3 flex-1 overflow-hidden rounded-sm bg-neutral-100 dark:bg-neutral-900">
          <span
            className={`block h-full ${corrente ? 'bg-neutral-900 dark:bg-white' : 'bg-neutral-400 dark:bg-neutral-600'}`}
            style={{ width: `${quotaPercentuale(valore, massimo)}%` }}
          />
        </span>
        <span className="w-24 shrink-0 text-right text-xs tabular-nums sm:w-28">
          {formattaEuro(valore)}
        </span>
      </Link>
    </li>
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
function Albero({ righe, totale }: { righe: readonly RigaCategoria[]; totale: bigint }) {
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
      const valore = centesimi(r.spesa);
      const diretta = centesimi(r.spesa_diretta);
      return [
        <li key={r.category_id} className="space-y-1">
          <div
            className="flex items-baseline justify-between gap-3 text-sm"
            style={{ paddingLeft: `${livello * 12}px` }}
          >
            <span>
              {r.categoria}
              <span className="ml-2 text-xs text-neutral-500">
                {r.movimenti} mov.
                {diretta !== valore && diretta !== 0n && ` · ${formattaEuro(diretta)} qui`}
              </span>
            </span>
            <span className="tabular-nums whitespace-nowrap">{formattaEuro(valore)}</span>
          </div>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-900"
            style={{ marginLeft: `${livello * 12}px` }}
          >
            <div
              className="h-full bg-neutral-400 dark:bg-neutral-600"
              style={{ width: `${quotaPercentuale(valore, totale)}%` }}
            />
          </div>
        </li>,
        ...rami(r.category_id, livello + 1),
      ];
    });
  }

  return <ul className="space-y-2">{rami(null, 0)}</ul>;
}
