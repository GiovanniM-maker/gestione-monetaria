import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { RigaCategoria, RigaClasse, RigaTotaleMese } from '@/lib/cruscotto/leggi';
import {
  leggiAvvisiNuovi,
  leggiCategorie,
  leggiClassi,
  leggiConfronto,
  leggiDaConfermare,
  leggiEntrate,
  leggiEsercenti,
  leggiFinestra,
  leggiRicorrente,
  leggiStato,
  leggiVariazioni,
  scegliMese,
} from '@/lib/cruscotto/letture';
import { etichettaBreve, etichettaMese, meseValido, quotaPercentuale } from '@/lib/cruscotto/mesi';
import { comeSiConfronta } from '@/lib/cruscotto/andamento';
import type { Variazione } from '@/lib/cruscotto/andamento';
import { formattaEuro, ordinaPerPeso, sommaCosti, totalePerTipo } from '@/lib/abbonamenti/formato';
import { estremiDelMese } from '@/lib/movimenti/filtri';
import { BOTTONE_MINORE } from '@/lib/ui/controlli';
import type { RigaStato } from '@/lib/movimenti/cerca';
import {
  BarraClassi,
  Ciambella,
  COLORE_CLASSE,
  fetteDellaCiambella,
  Freccia,
  ORDINE_CLASSI,
  type FettaCategoria,
} from './grafici';
import {
  ScheletroCiambella,
  ScheletroCoppia,
  ScheletroElenco,
  ScheletroTestata,
} from './scheletri';

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
 * ---------------------------------------------------------------------------
 * Ogni blocco aspetta solo i propri dati
 * ---------------------------------------------------------------------------
 * Prima una funzione sola leggeva undici cose e la pagina compariva quando la
 * piu' lenta aveva finito. Ora la pagina fa **una** query — quali mesi
 * esistono — e da li' in poi ogni sezione arriva per conto suo, dentro il
 * proprio `<Suspense>`, con al posto suo uno scheletro della forma giusta.
 *
 * Il tempo totale non cambia. Il tempo prima di vedere il numerone crolla, ed
 * e' quello che si percepisce come velocita'.
 *
 * Le letture sono deduplicate con `cache()`: due sezioni che chiedono la stessa
 * finestra di confronto fanno una query sola. Senza, spezzare avrebbe
 * moltiplicato le query invece di riordinarle.
 *
 * Il mese sta nell'indirizzo (`/?mese=2026-07`) e non in uno stato del browser:
 * la pagina resta un componente server e un mese si puo' mandare a se' stessi
 * come collegamento.
 */

/** Quanti mesi mostra l'andamento. Un anno e' il minimo per vedere una stagione. */
const MESI_ANDAMENTO = 12;

function centesimi(valore: string | null): bigint {
  const { totale, nonLetti } = sommaCosti([valore]);
  return nonLetti > 0 ? 0n : totale;
}

function sommaClassi(righe: readonly { spesa: string }[]): bigint {
  return righe.reduce((s, r) => s + centesimi(r.spesa), 0n);
}

/**
 * Le quattro classi, nell'ordine fisso della barra.
 *
 * `personale` e `business` si sommano **qui e solo qui**: la barra risponde a
 * «come si divide il mese fra le quattro classi», che ha sempre le stesse
 * quattro voci ed e' per questo che la sua forma si impara. La distinzione fra
 * i due contesti resta intera nell'elenco sotto, dove c'e' spazio per dirla.
 */
function perLaBarra(classi: readonly RigaClasse[]) {
  const note = ORDINE_CLASSI.map((nome) => ({
    chiave: nome,
    valore: sommaClassi(classi.filter((c) => c.discrezionalita === nome)),
  }));
  const resto = classi.filter((c) => !ORDINE_CLASSI.includes(c.discrezionalita));
  return resto.length === 0
    ? note
    : [...note, { chiave: 'non classificato', valore: sommaClassi(resto) }];
}

const perMese = (mese: string, extra: Record<string, string> = {}): string => {
  const periodo = estremiDelMese(mese);
  const p = new URLSearchParams(periodo === null ? {} : { da: periodo.da, a: periodo.a });
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  return `/movimenti?${p.toString()}`;
};

export default async function CruscottoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parametri = await searchParams;
  // L'unica lettura che la pagina aspetta davvero: senza sapere quali mesi
  // esistono non si sa nemmeno quale mostrare.
  const { mese, totali, rigaMese, mesePrecedente, meseSuccessivo, inCorso } = await scegliMese(
    meseValido(parametri['mese']),
  );

  const andamento = totali.slice(-MESI_ANDAMENTO);
  const piuAlto = andamento.reduce((max, r) => {
    const v = centesimi(r.spesa);
    return v < max ? v : max;
  }, 0n);

  return (
    <div className="space-y-10">
      {/* Lo stato del sistema e gli avvisi non bloccano niente: se tardano,
          tarda una riga grigia, non il numero del mese. */}
      <Suspense fallback={null}>
        <StatoEAvvisi />
      </Suspense>

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

      <Suspense fallback={<ScheletroTestata />}>
        <QuantoHoSpeso mese={mese} rigaMese={rigaMese} />
      </Suspense>

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
        <Suspense fallback={<ScheletroCoppia />}>
          <Ricorrente mese={mese} />
        </Suspense>
      </section>

      {/* L'andamento non ha bisogno di nessuna query in piu': i totali di tutti
          i mesi sono gia' quelli che hanno deciso quale mese mostrare. */}
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

      <Suspense fallback={<ScheletroCiambella />}>
        <InCosa mese={mese} />
      </Suspense>

      <Suspense fallback={<ScheletroElenco />}>
        <DaChi mese={mese} />
      </Suspense>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* I blocchi, ognuno con le sue letture                                        */
/* -------------------------------------------------------------------------- */

async function StatoEAvvisi() {
  const [stato, avvisi, daConfermare] = await Promise.all([
    leggiStato(),
    leggiAvvisiNuovi(),
    leggiDaConfermare(),
  ]);

  return (
    <div className="space-y-4">
      {stato.map((s) => (
        <StatoSistema key={s.connection_id} riga={s} />
      ))}

      {/* Al massimo tre: una lista lunga di avvisi non e' piu' una lista di
          avvisi. */}
      {avvisi.length > 0 && (
        <div className="space-y-2">
          {avvisi.slice(0, 3).map((a) => (
            <Link
              key={a.id}
              href="/avvisi"
              className={`block rounded-lg border p-3 text-sm ${
                a.severity === 'critical'
                  ? 'border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200'
                  : a.severity === 'warning'
                    ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200'
                    : 'border-neutral-200 dark:border-neutral-800'
              }`}
            >
              <span className="font-medium">{a.title}</span>
              <span className="mt-0.5 block text-xs opacity-80">{a.body}</span>
            </Link>
          ))}
          {avvisi.length > 3 && (
            <Link className="text-xs text-neutral-500 underline" href="/avvisi">
              altri {avvisi.length - 3} avvisi
            </Link>
          )}
        </div>
      )}

      {/* Con il conteggio e non con un pallino: un numero e' un invito, un
          pallino rosso e' un'ansia. */}
      {daConfermare > 0 && (
        <Link
          href="/da-confermare"
          className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700"
        >
          <span>
            <strong>{daConfermare}</strong>{' '}
            {daConfermare === 1 ? 'movimento nuovo' : 'movimenti nuovi'} da confermare
          </span>
          <span className="shrink-0 text-neutral-500">→</span>
        </Link>
      )}
    </div>
  );
}

async function QuantoHoSpeso({
  mese,
  rigaMese,
}: {
  mese: string;
  rigaMese: RigaTotaleMese | null;
}) {
  const [classi, variazioni, confronto, { giorniCoperti }, entrate] = await Promise.all([
    leggiClassi(mese),
    leggiVariazioni(mese),
    leggiConfronto(mese),
    leggiFinestra(mese),
    leggiEntrate(mese),
  ]);

  // Il totale viene da `v_monthly_totals`, la vista che lo definisce. Le classi
  // darebbero lo stesso numero, ma farlo dipendere da due letture invece che da
  // una non porta niente.
  const speso = rigaMese === null ? sommaClassi(classi) : centesimi(rigaMese.spesa);
  const incassato = entrate === null ? null : centesimi(entrate.entrate);
  const perClasse = new Map(
    variazioni.classi.map((v) => [`${v.discrezionalita}|${v.contesto}`, v as Variazione]),
  );
  const spiegaIlConfronto = comeSiConfronta(variazioni.classi[0]);

  return (
    <section className="space-y-4">
      <p className="text-3xl font-semibold tabular-nums sm:text-4xl">{formattaEuro(speso)}</p>

      {confronto !== null && giorniCoperti !== null && (
        <div className="rounded-lg border border-neutral-200 p-3 text-sm dark:border-neutral-800">
          <p>
            Nei <strong>primi {giorniCoperti} giorni</strong> del mese hai speso{' '}
            <strong className="tabular-nums">{formattaEuro(confronto.corrente.spesa)}</strong>
            {confronto.riferimento !== null && (
              <>
                , contro{' '}
                <strong className="tabular-nums">{formattaEuro(confronto.riferimento)}</strong>{' '}
                negli stessi giorni dei mesi scorsi
                {confronto.scostamento !== null && (
                  <>
                    {' '}
                    — {confronto.scostamento > 0 ? '+' : ''}
                    {confronto.scostamento.toFixed(0)}%
                  </>
                )}
              </>
            )}
            .
          </p>
          {confronto.precedenti.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
              {confronto.precedenti.map((p) => (
                <li key={p.mese} className="tabular-nums">
                  {etichettaBreve(p.mese)} {formattaEuro(p.spesa)}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-neutral-500">
            Finestre della stessa lunghezza, non una proiezione a fine mese: «a questo ritmo
            spenderai X» sarebbe un&rsquo;estrapolazione travestita da informazione.
          </p>
        </div>
      )}

      <Link className={`${BOTTONE_MINORE} w-fit`} href={perMese(mese)}>
        vedi i {rigaMese?.movimenti ?? 0} movimenti del mese
      </Link>

      {classi.length === 0 ? (
        <p className="text-sm text-neutral-500">Nessun movimento in questo mese.</p>
      ) : (
        <div className="space-y-3">
          <BarraClassi voci={perLaBarra(classi)} />

          <ul className="text-sm">
            {classi.map((c) => (
              <li
                key={`${c.discrezionalita}-${c.contesto}`}
                className="border-b border-neutral-100 dark:border-neutral-900"
              >
                <Link
                  href={perMese(mese, { classe: c.discrezionalita })}
                  className="flex min-h-11 items-center justify-between gap-3"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: COLORE_CLASSE[c.discrezionalita] ?? '#a3a3a3' }}
                    />
                    <span className="min-w-0 truncate">
                      {c.discrezionalita}
                      <span className="text-neutral-500"> · {c.contesto}</span>
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums whitespace-nowrap">
                    {formattaEuro(centesimi(c.spesa))}
                    <Freccia riga={perClasse.get(`${c.discrezionalita}|${c.contesto}`)} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {variazioni.mancanti !== null && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              I confronti col mese tipico non sono disponibili, quindi le frecce non compaiono.{' '}
              <strong>Le cifre qui sopra sono corrette</strong> — vengono dalle viste, non dal
              confronto. Motivo: {variazioni.mancanti}
            </p>
          )}

          {spiegaIlConfronto !== null && (
            <p className="text-xs text-neutral-500">
              {spiegaIlConfronto} Il termine di paragone &egrave; la mediana <strong>scelta</strong>{' '}
              — un mese realmente osservato, non una media. Le frecce con un asterisco poggiano su
              meno della met&agrave; dei mesi guardati.
            </p>
          )}
        </div>
      )}

      {incassato !== null && incassato !== 0n && (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Entrate del mese <strong className="tabular-nums">{formattaEuro(incassato)}</strong> — la
          spesa ne &egrave; <strong>{quotaPercentuale(speso, incassato).toFixed(0)}%</strong>.{' '}
          <span className="text-neutral-500">
            Escluse le entrate che sono giroconti: un rientro dal conto deposito non &egrave;
            reddito.
          </span>
        </p>
      )}

      {rigaMese !== null && (rigaMese.senza_cambio > 0 || rigaMese.senza_categoria > 0) && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {rigaMese.senza_cambio > 0 && (
            <>
              <strong>{rigaMese.senza_cambio}</strong> movimenti in valuta senza tasso di cambio{' '}
              <strong>non sono nel totale</strong>: convertirli a runtime darebbe due numeri diversi
              in due schermate.{' '}
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
  );
}

async function Ricorrente({ mese }: { mese: string }) {
  const voci = ordinaPerPeso(await leggiRicorrente());
  const abbonamenti = totalePerTipo(voci, 'abbonamento');
  const abitudini = totalePerTipo(voci, 'abitudine');

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <p className="text-xs tracking-wide text-neutral-500 uppercase">Abbonamenti</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formattaEuro(abbonamenti)}</p>
          <p className="mt-1 text-xs text-neutral-500">Si disdicono. Il risparmio è certo.</p>
        </div>
        <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <p className="text-xs tracking-wide text-neutral-500 uppercase">Abitudini</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formattaEuro(abitudini)}</p>
          <p className="mt-1 text-xs text-neutral-500">
            Niente da disdire: si ripete perché lo si rifà.
          </p>
        </div>
      </div>
      <p className="text-xs text-neutral-500">
        Sono tassi calcolati su tutto lo storico, non su {etichettaMese(mese)}: dicono quanto costa
        ciò che si ripete, non quanto è uscito questo mese. Non si sommano fra loro perché
        suggeriscono due azioni diverse.
      </p>
    </>
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
      valore: centesimi(c.spesa),
      href: `/categoria/${c.category_id}?mese=${mese}`,
      variazione: perCategoria.get(c.category_id),
    }))
    .filter((f) => f.valore !== 0n);
  const inCategoria = radici.reduce((s, r) => s + r.valore, 0n);
  const totale = sommaClassi(categorie.filter((c) => c.parent_id === null));

  return (
    <>
      {radici.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-medium">In cosa</h2>
          <Ciambella voci={fetteDellaCiambella(radici)} totale={inCategoria} />
          <p className="text-xs text-neutral-500">
            L&rsquo;anello mostra i rami principali. Si tocca la riga e non la fetta: su un telefono
            una fetta &egrave; larga venti pixel e si sbaglia col pollice.
          </p>
        </section>
      )}

      <section className="mt-10 space-y-2">
        <h2 className="font-medium">L&rsquo;albero intero</h2>
        <p className="text-xs text-neutral-500">
          Ogni categoria porta la somma delle sue sottocategorie, e si tocca per vedere di cosa
          &egrave; fatta. Dove la cifra fra parentesi compare, &egrave; la parte finita direttamente
          su quel nodo invece che in un figlio.
        </p>
        <Albero righe={categorie} totale={totale} mese={mese} variazioni={perCategoria} />
      </section>
    </>
  );
}

async function DaChi({ mese }: { mese: string }) {
  const [esercenti, variazioni] = await Promise.all([leggiEsercenti(mese), leggiVariazioni(mese)]);
  if (esercenti.length === 0) return null;

  const perEsercente = new Map(variazioni.esercenti.map((v) => [v.merchant_id, v as Variazione]));

  return (
    <section className="space-y-2">
      <h2 className="font-medium">Da chi</h2>
      <ul className="space-y-1 text-sm">
        {esercenti.map((e, i) => {
          const valore = centesimi(e.spesa);
          const riga = (
            <>
              <span className="min-w-0">
                <span className="block truncate">{e.esercente}</span>
                <span className="text-xs text-neutral-500">
                  {e.movimenti} {e.movimenti === 1 ? 'movimento' : 'movimenti'} ·{' '}
                  {e.discrezionalita}
                </span>
              </span>
              <span className="shrink-0 tabular-nums whitespace-nowrap">
                {formattaEuro(valore)}
                <Freccia
                  riga={e.merchant_id === null ? undefined : perEsercente.get(e.merchant_id)}
                />
              </span>
            </>
          );
          return (
            <li
              key={`${e.merchant_id ?? 'nessuno'}-${e.discrezionalita}-${i}`}
              className="border-b border-neutral-100 dark:border-neutral-900"
            >
              {e.merchant_id === null ? (
                <span className="flex min-h-11 items-center justify-between gap-3">{riga}</span>
              ) : (
                <Link
                  href={`/esercente/${e.merchant_id}`}
                  className="flex min-h-11 items-center justify-between gap-3"
                >
                  {riga}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
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
      const valore = centesimi(r.spesa);
      const diretta = centesimi(r.spesa_diretta);
      return [
        <li key={r.category_id} className="space-y-1">
          <Link
            href={`/categoria/${r.category_id}?mese=${mese}`}
            className="flex min-h-11 items-center justify-between gap-3 text-sm"
            style={{ paddingLeft: `${livello * 12}px` }}
          >
            <span className="min-w-0">
              <span className="block truncate">{r.categoria}</span>
              <span className="text-xs text-neutral-500">
                {r.movimenti} mov.
                {diretta !== valore && diretta !== 0n && ` · ${formattaEuro(diretta)} qui`}
              </span>
            </span>
            <span className="shrink-0 tabular-nums whitespace-nowrap">
              {formattaEuro(valore)}
              <Freccia riga={variazioni.get(r.category_id)} />
            </span>
          </Link>
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

/**
 * Lo stato della connessione bancaria.
 *
 * Sta in cima a tutto e non in una pagina di diagnostica, per una ragione
 * sola: `valid_until` non era mostrato da nessuna parte, e il consenso Enable
 * Banking scade. Quando scade **i dati smettono di arrivare in silenzio** — il
 * cruscotto continuerebbe a mostrare numeri, sempre piu' vecchi, senza dire
 * niente. Per un'applicazione che esiste per essere creduta e' il guasto
 * peggiore possibile.
 *
 * Quando va tutto bene e' una riga grigia di una frase. Compare in evidenza
 * solo quando c'e' qualcosa da fare, perche' un avviso che c'e' sempre non e'
 * piu' un avviso.
 */
function StatoSistema({ riga }: { riga: RigaStato }) {
  const giorni = riga.giorni_al_rinnovo;
  const scaduto = giorni !== null && giorni < 0;
  const inScadenza = giorni !== null && giorni >= 0 && giorni <= 30;
  const grave = scaduto || riga.stato_connessione === 'error';

  if (!grave && !inScadenza) {
    return (
      <p className="text-xs text-neutral-500">
        {riga.banca}: ultimo movimento {riga.ultimo_movimento ?? '—'}
        {giorni !== null && ` · consenso valido ancora ${giorni} giorni`}
        {riga.movimenti_provvisori > 0 &&
          ` · ${riga.movimenti_provvisori} movimenti provvisori, l’importo può ancora cambiare`}
      </p>
    );
  }

  return (
    <div
      className={`rounded-lg border p-3 text-sm ${
        grave
          ? 'border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200'
          : 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200'
      }`}
    >
      <p className="font-medium">
        {scaduto
          ? `Il consenso ${riga.banca} è scaduto da ${-(giorni ?? 0)} giorni.`
          : `Il consenso ${riga.banca} scade fra ${giorni} giorni.`}
      </p>
      <p className="mt-1">
        {scaduto
          ? 'I movimenti nuovi non arrivano più, e i numeri qui sotto smettono di aggiornarsi senza che nulla lo segnali. Va rinnovato dal '
          : 'Va rinnovato prima della scadenza, altrimenti i dati smettono di arrivare in silenzio. Si rinnova dal '}
        <Link className="underline" href="/debug/eb">
          pannello Enable Banking
        </Link>
        .
      </p>
      <p className="mt-1 text-xs">
        Ultimo movimento {riga.ultimo_movimento ?? '—'} · ultima sincronizzazione riuscita{' '}
        {riga.ultima_sync_riuscita?.slice(0, 10) ?? 'mai'}
        {riga.ultimo_errore !== null && ` · ultimo errore: ${riga.ultimo_errore}`}
      </p>
    </div>
  );
}
