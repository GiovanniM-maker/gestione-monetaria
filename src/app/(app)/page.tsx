import type { Metadata } from 'next';
import Link from 'next/link';
import { leggiCruscotto } from '@/lib/cruscotto/leggi';
import type { RigaClasse, RigaCategoria, RigaTotaleMese } from '@/lib/cruscotto/leggi';
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
 *
 * E' una somma di interi di centesimi, non una divisione: nessuna variazione si
 * ricalcola qui — quelle arrivano da SQL riga per riga.
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
    variazioniClassi,
    categorie,
    variazioniCategorie,
    esercenti,
    variazioniEsercenti,
    variazioniMancanti,
    ricorrente,
    entrate,
    stato,
    daConfermare,
    avvisi,
    confronto,
    giorniCoperti,
  } = dati;

  // Gli estremi del mese servono a mandare ogni aggregato alla lista movimenti
  // gia' filtrata: e' cio' che trasforma il cruscotto da fotografia a porta.
  const periodo = estremiDelMese(mese);
  const perMese = (extra: Record<string, string> = {}): string => {
    const p = new URLSearchParams(periodo === null ? {} : { da: periodo.da, a: periodo.a });
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return `/movimenti?${p.toString()}`;
  };

  const incassato = entrate === null ? null : centesimi(entrate.entrate);

  const indice = mesiDisponibili.indexOf(mese);
  const meseSuccessivo = indice >= 0 ? (mesiDisponibili[indice + 1] ?? null) : null;

  const rigaMese = totali.find((t) => t.mese === mese) ?? null;

  // Il totale del mese viene da `v_monthly_totals`, che e' la vista che lo
  // definisce. Sommare le classi darebbe lo stesso numero — le due viste
  // stanno entrambe su `v_expenses` — ma lo farebbe dipendere da una seconda
  // lettura, e un totale non deve mai dipendere da piu' cose del necessario.
  const speso = rigaMese === null ? sommaClassi(classi) : centesimi(rigaMese.spesa);

  // Le variazioni, indicizzate: l'albero e l'elenco degli esercenti restano
  // quelli delle viste — che portano `spesa_diretta`, lo slug, la
  // discrezionalita' — e ci si aggancia accanto la freccia.
  const perClasse = new Map(
    variazioniClassi.map((v) => [`${v.discrezionalita}|${v.contesto}`, v as Variazione]),
  );
  const perCategoria = new Map(variazioniCategorie.map((v) => [v.category_id, v as Variazione]));
  const perEsercente = new Map(variazioniEsercenti.map((v) => [v.merchant_id, v as Variazione]));

  // La ciambella disegna solo le **radici**: con il roll-up, la somma delle
  // radici e' la spesa categorizzata del mese, esattamente una volta. Mettendoci
  // anche le figlie ogni euro comparirebbe due volte e il giro non vorrebbe
  // piu' dire niente.
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

  // Come e' fatto il confronto lo dice una riga sola, presa da una qualsiasi
  // delle righe: la finestra e' la stessa per tutte, ed e' il punto della 0036.
  const spiegaIlConfronto = comeSiConfronta(variazioniClassi[0]);

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
      {/* LO STATO DEL SISTEMA                                              */}
      {/* ---------------------------------------------------------------- */}
      {stato.map((s) => (
        <StatoSistema key={s.connection_id} riga={s} />
      ))}

      {/* Gli avvisi che il riquadro di stato non dice gia'. Al massimo tre:
          una lista lunga di avvisi non e' piu' una lista di avvisi. */}
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

      {/* Cosa richiede un gesto. Con il conteggio e non con un pallino: un
          numero e' un invito, un pallino rosso e' un'ansia. */}
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
        </div>

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

        <Link className={`${BOTTONE_MINORE} w-fit`} href={perMese()}>
          vedi i {rigaMese?.movimenti ?? 0} movimenti del mese
        </Link>

        {classi.length === 0 ? (
          <p className="text-sm text-neutral-500">Nessun movimento in questo mese.</p>
        ) : (
          <div className="space-y-3">
            {/* Una barra sola, sempre con le stesse quattro voci nello stesso
                ordine: e' la forma che si impara, e che fa riconoscere un mese
                anomalo senza leggere un numero. */}
            <BarraClassi voci={perLaBarra(classi)} />

            <ul className="text-sm">
              {classi.map((c) => (
                <li
                  key={`${c.discrezionalita}-${c.contesto}`}
                  className="border-b border-neutral-100 dark:border-neutral-900"
                >
                  <Link
                    href={perMese({ classe: c.discrezionalita })}
                    className="flex min-h-11 items-center justify-between gap-3"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{
                          backgroundColor: COLORE_CLASSE[c.discrezionalita] ?? '#a3a3a3',
                        }}
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

            {variazioniMancanti !== null && (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                I confronti col mese tipico non sono disponibili, quindi le frecce non compaiono.{' '}
                <strong>Le cifre qui sopra sono corrette</strong> — vengono dalle viste, non dal
                confronto. Motivo: {variazioniMancanti}
              </p>
            )}

            {spiegaIlConfronto !== null && (
              <p className="text-xs text-neutral-500">
                {spiegaIlConfronto} Il termine di paragone &egrave; la mediana{' '}
                <strong>scelta</strong> — un mese realmente osservato, non una media. Le frecce con
                un asterisco poggiano su meno della met&agrave; dei mesi guardati: la spesa non
                capita tutti i mesi, quindi il confronto vale meno.
              </p>
            )}
          </div>
        )}

        {incassato !== null && incassato !== 0n && (
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Entrate del mese <strong className="tabular-nums">{formattaEuro(incassato)}</strong> —
            la spesa ne &egrave; <strong>{quotaPercentuale(speso, incassato).toFixed(0)}%</strong>.{' '}
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

      {categorie.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium">L&rsquo;albero intero</h2>
          <p className="text-xs text-neutral-500">
            Ogni categoria porta la somma delle sue sottocategorie, e si tocca per vedere di cosa
            &egrave; fatta. Dove la cifra fra parentesi compare, &egrave; la parte finita
            direttamente su quel nodo invece che in un figlio.
          </p>
          <Albero righe={categorie} totale={speso} mese={mese} variazioni={perCategoria} />
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
