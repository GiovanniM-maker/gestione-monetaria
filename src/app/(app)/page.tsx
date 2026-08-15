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
import { MesePerMese } from './livello';
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

/**
 * La classe che pesa di piu' nel mese. Tinge appena la scheda del numerone.
 *
 * E' tutta la decorazione che c'e', e non e' decorazione: dopo qualche mese il
 * colore del riquadro dice com'e' andato il mese prima di leggere una cifra.
 */
function classeDominante(voci: readonly { chiave: string; valore: bigint }[]): string | null {
  const m = (v: bigint) => (v < 0n ? -v : v);
  const vinta = voci.reduce<{ chiave: string; valore: bigint } | null>(
    (max, v) => (max === null || m(v.valore) > m(max.valore) ? v : max),
    null,
  );
  return vinta === null || vinta.valore === 0n ? null : vinta.chiave;
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

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[22px] font-bold tracking-[-0.03em] capitalize">
          {etichettaMese(mese)}
        </h1>
        <nav className="flex items-center gap-1 text-sm">
          {mesePrecedente !== null && (
            <Link
              className="inline-flex size-11 items-center justify-center rounded-full text-testo-2"
              href={`/?mese=${mesePrecedente}`}
              aria-label={`vai a ${etichettaMese(mesePrecedente)}`}
            >
              ‹
            </Link>
          )}
          {inCorso ? (
            <span className="rounded-full bg-s2 px-3 py-1 text-[11px] font-medium text-testo-2">
              in corso
            </span>
          ) : (
            meseSuccessivo !== null && (
              <Link
                className="inline-flex size-11 items-center justify-center rounded-full text-testo-2"
                href={`/?mese=${meseSuccessivo}`}
                aria-label={`vai a ${etichettaMese(meseSuccessivo)}`}
              >
                ›
              </Link>
            )
          )}
        </nav>
      </div>

      <Suspense fallback={<ScheletroTestata />}>
        <QuantoHoSpeso mese={mese} rigaMese={rigaMese} />
      </Suspense>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[17px] font-semibold tracking-[-0.02em]">
            Di questo, quanto torna ogni mese
          </h2>
          <Link
            className="inline-flex min-h-11 shrink-0 items-center text-[13px] text-essenziale sm:min-h-0"
            href="/abbonamenti"
          >
            dettaglio ›
          </Link>
        </div>
        <Suspense fallback={<ScheletroCoppia />}>
          <Ricorrente mese={mese} />
        </Suspense>
      </section>

      {/* L'andamento non ha bisogno di nessuna query in piu': i totali di tutti
          i mesi sono gia' quelli che hanno deciso quale mese mostrare. */}
      <MesePerMese
        titolo="Andamento"
        righe={andamento.map((r) => ({ mese: r.mese, valore: centesimi(r.spesa) }))}
        corrente={mese}
        href={(m) => `/?mese=${m}`}
      />

      <Suspense fallback={<ScheletroCiambella />}>
        <InCosa mese={mese} />
      </Suspense>

      <Suspense fallback={<ScheletroElenco />}>
        <DaChi mese={mese} />
      </Suspense>

      {/* Lo stato e gli avvisi stanno **in fondo**, ed e' la decisione che
          cambia di piu' la schermata. Prima occupavano tutta la prima vista: un
          avviso che compare prima del numero si legge come «c'e' un problema»
          ogni volta che apri l'app, e dopo una settimana non lo leggi piu'. E'
          il modo in cui muoiono i canali di notifica, gia' scritto nelle
          decisioni della Fase 8 — e rientrava dalla disposizione. */}
      <Suspense fallback={null}>
        <StatoEAvvisi />
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
    <div className="space-y-3">
      {/* Con il conteggio e non con un pallino: un numero e' un invito, un
          pallino rosso e' un'ansia. */}
      {daConfermare > 0 && (
        <Link
          href="/da-confermare"
          className="scheda flex min-h-12 items-center gap-3 px-4 text-[15px]"
        >
          <span className="flex-1">
            <strong>{daConfermare}</strong>{' '}
            {daConfermare === 1 ? 'movimento nuovo' : 'movimenti nuovi'} da confermare
          </span>
          <span aria-hidden="true" className="shrink-0 text-testo-3">
            ›
          </span>
        </Link>
      )}

      {/* Al massimo tre: una lista lunga di avvisi non e' piu' una lista di
          avvisi. */}
      {avvisi.length > 0 && (
        <div className="space-y-2">
          {avvisi.slice(0, 3).map((a) => (
            <Avviso key={a.id} titolo={a.title} corpo={a.body} gravita={a.severity} />
          ))}
          {avvisi.length > 3 && (
            <Link
              className="inline-flex min-h-11 items-center text-[13px] text-essenziale"
              href="/avvisi"
            >
              altri {avvisi.length - 3} avvisi ›
            </Link>
          )}
        </div>
      )}

      {stato.map((s) => (
        <StatoSistema key={s.connection_id} riga={s} />
      ))}
    </div>
  );
}

/**
 * Il riquadro di un avviso.
 *
 * Il fondo e' una velatura del colore, non il colore: su un telefono al buio un
 * riquadro rosso pieno e' l'unica cosa che si vede della schermata, e un avviso
 * che grida piu' del numerone insegna a chiudere l'app invece che a leggerlo.
 * I due toni sono gia' nella tavolozza — `voluttuario` e `utile` — perche' una
 * quinta e una sesta tinta renderebbero il colore un'informazione in meno.
 */
function Avviso({
  titolo,
  corpo,
  gravita,
  href = '/avvisi',
}: {
  titolo: string;
  corpo: string | null;
  gravita: string;
  href?: string;
}) {
  const tinta =
    gravita === 'critical'
      ? 'var(--voluttuario)'
      : gravita === 'warning'
        ? 'var(--utile)'
        : 'var(--neutro)';

  return (
    <Link
      href={href}
      className="scheda block p-4 text-[14px]"
      style={{ background: `color-mix(in oklab, ${tinta} 12%, var(--s2))` }}
    >
      <span className="flex items-center gap-2 font-semibold">
        <span
          aria-hidden="true"
          className="size-2 shrink-0 rounded-full"
          style={{ background: tinta }}
        />
        {titolo}
      </span>
      {corpo !== null && <span className="mt-1 block text-testo-2">{corpo}</span>}
    </Link>
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

  const perLaBarraOra = perLaBarra(classi);
  const dominante = classeDominante(perLaBarraOra);
  const tinta = dominante === null ? null : (COLORE_CLASSE[dominante] ?? null);

  return (
    <section className="space-y-4">
      {/* La scheda del mese. Tinta appena dalla classe che pesa di piu': dopo
          qualche mese il colore dice com'e' andato prima di leggere una cifra. */}
      <div
        className="scheda space-y-3 p-5"
        style={
          tinta === null
            ? undefined
            : {
                backgroundImage: `radial-gradient(24rem 12rem at 8% 0%, color-mix(in oklab, ${tinta} 26%, transparent), transparent 70%)`,
              }
        }
      >
        {giorniCoperti !== null && confronto !== null && (
          <p className="text-[13px] text-testo-2">nei primi {giorniCoperti} giorni</p>
        )}
        <p className="numerone text-[40px] sm:text-[46px]">{formattaEuro(speso)}</p>

        {confronto !== null && confronto.riferimento !== null ? (
          <p className="cifra text-[13px] text-testo-2">
            di solito {formattaEuro(confronto.riferimento)}
            {confronto.scostamento !== null && (
              <span className={confronto.scostamento > 0 ? 'text-utile' : 'text-investimento'}>
                {' '}
                · {confronto.scostamento > 0 ? '▲' : '▼'}{' '}
                {Math.abs(confronto.scostamento).toFixed(0)}%
              </span>
            )}
          </p>
        ) : (
          spiegaIlConfronto !== null && (
            <p className="text-[13px] text-testo-2">{spiegaIlConfronto}</p>
          )
        )}

        {classi.length > 0 && <BarraClassi voci={perLaBarraOra} />}
      </div>

      {classi.length === 0 ? (
        <p className="text-sm text-testo-2">Nessun movimento in questo mese.</p>
      ) : (
        <div className="scheda px-4">
          <ul className="elenco text-[15px]">
            {classi.map((c) => (
              <li key={`${c.discrezionalita}-${c.contesto}`}>
                <Link
                  href={perMese(mese, { classe: c.discrezionalita })}
                  className="flex min-h-12 items-center gap-2.5"
                >
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: COLORE_CLASSE[c.discrezionalita] ?? 'var(--neutro)' }}
                  />
                  {/* Classe e contesto su due righe: su una sola, «Voluttuario ·
                      Personale» accanto a un importo e a una freccia finiva
                      troncato a «Voluttuario · Per…», e il nome della classe e'
                      la cosa che si legge. */}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate capitalize">{c.discrezionalita}</span>
                    {/* Su una riga non classificata classe e contesto sono la
                        stessa parola, e ripeterla non aggiunge niente. */}
                    {c.contesto !== c.discrezionalita && (
                      <span className="block truncate text-[12px] text-testo-3">{c.contesto}</span>
                    )}
                  </span>
                  <span className="cifra shrink-0 whitespace-nowrap">
                    {formattaEuro(centesimi(c.spesa))}
                    <Freccia riga={perClasse.get(`${c.discrezionalita}|${c.contesto}`)} />
                  </span>
                  <span aria-hidden="true" className="shrink-0 text-testo-3">
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {incassato !== null && incassato !== 0n && (
        <p className="text-[13px] text-testo-2">
          Entrate <span className="cifra font-medium text-testo">{formattaEuro(incassato)}</span> —
          la spesa ne &egrave; il {quotaPercentuale(speso, incassato).toFixed(0)}%.
        </p>
      )}

      {/* La prosa metodologica sta sotto un «perche'?»: vera e ben scritta, ma
          alla decima volta occupa lo spazio dei numeri. */}
      {(confronto !== null || spiegaIlConfronto !== null) && (
        <details className="text-[13px] text-testo-2">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-testo-3">
            perch&eacute; questi confronti?
          </summary>
          <div className="space-y-2 pb-2">
            {spiegaIlConfronto !== null && (
              <p>
                {spiegaIlConfronto} Il termine di paragone &egrave; la mediana{' '}
                <strong className="text-testo">scelta</strong> — un mese realmente osservato, non
                una media. Le frecce con un asterisco poggiano su meno della met&agrave; dei mesi
                guardati.
              </p>
            )}
            {confronto !== null && confronto.precedenti.length > 0 && (
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-testo-3">
                {confronto.precedenti.map((pr) => (
                  <li key={pr.mese} className="cifra">
                    {etichettaBreve(pr.mese)} {formattaEuro(pr.spesa)}
                  </li>
                ))}
              </ul>
            )}
            <p>
              Finestre della stessa lunghezza, non una proiezione a fine mese: «a questo ritmo
              spenderai X» sarebbe un&rsquo;estrapolazione travestita da informazione.
            </p>
          </div>
        </details>
      )}

      {variazioni.mancanti !== null && (
        <p className="scheda p-3 text-[13px] text-utile">
          I confronti col mese tipico non sono disponibili, quindi le frecce non compaiono.{' '}
          <strong>Le cifre qui sopra sono corrette.</strong> Motivo: {variazioni.mancanti}
        </p>
      )}

      {rigaMese !== null && (rigaMese.senza_cambio > 0 || rigaMese.senza_categoria > 0) && (
        <p className="scheda p-3 text-[13px] text-testo-2">
          {rigaMese.senza_cambio > 0 && (
            <>
              <strong className="text-testo">{rigaMese.senza_cambio}</strong> movimenti in valuta
              senza tasso di cambio non sono nel totale.{' '}
            </>
          )}
          {rigaMese.senza_categoria > 0 && (
            <>
              <strong className="text-testo">{rigaMese.senza_categoria}</strong> movimenti per{' '}
              {formattaEuro(centesimi(rigaMese.spesa_senza_categoria))} sono nel totale ma senza
              categoria.{' '}
              <Link className="text-essenziale" href="/revisione">
                Assegnali
              </Link>
              .
            </>
          )}
        </p>
      )}

      <Link
        className="inline-flex min-h-11 items-center text-[13px] text-essenziale"
        href={perMese(mese)}
      >
        vedi i {rigaMese?.movimenti ?? 0} movimenti del mese ›
      </Link>
    </section>
  );
}

async function Ricorrente({ mese }: { mese: string }) {
  const voci = ordinaPerPeso(await leggiRicorrente());
  const abbonamenti = totalePerTipo(voci, 'abbonamento');
  const abitudini = totalePerTipo(voci, 'abitudine');

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="scheda p-4">
          <p className="text-[13px] text-testo-2">Abbonamenti</p>
          <p className="numerone mt-1.5 text-[26px]">{formattaEuro(abbonamenti)}</p>
          <p className="mt-1.5 text-[12px] text-testo-3">Si disdicono. Il risparmio è certo.</p>
        </div>
        <div className="scheda p-4">
          <p className="text-[13px] text-testo-2">Abitudini</p>
          <p className="numerone mt-1.5 text-[26px]">{formattaEuro(abitudini)}</p>
          <p className="mt-1.5 text-[12px] text-testo-3">
            Niente da disdire: si ripete perché lo si rifà.
          </p>
        </div>
      </div>
      {/* Perche' i due numeri non si sommano e perche' non parlano di questo
          mese e' vero e va detto — ma non a ogni apertura, sopra i numeri. */}
      <details className="text-[13px] text-testo-2">
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-testo-3">
          perch&eacute; due numeri e non uno?
        </summary>
        <p className="pb-2">
          Sono tassi calcolati su tutto lo storico, non su {etichettaMese(mese)}: dicono quanto
          costa ciò che si ripete, non quanto è uscito questo mese. Non si sommano fra loro perché
          suggeriscono due azioni diverse — un abbonamento si disdice, un&rsquo;abitudine si cambia.
        </p>
      </details>
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
          <h2 className="text-[17px] font-semibold tracking-[-0.02em]">In cosa</h2>
          <div className="scheda p-4">
            <Ciambella voci={fetteDellaCiambella(radici)} totale={inCategoria} />
          </div>
        </section>
      )}

      {/* L'albero intero e' un inventario, non una risposta: sta chiuso, e si
          apre quando la ciambella non basta. Aperto era la meta' della
          schermata, ogni volta. */}
      <details className="mt-8">
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
    </>
  );
}

async function DaChi({ mese }: { mese: string }) {
  const [esercenti, variazioni] = await Promise.all([leggiEsercenti(mese), leggiVariazioni(mese)]);
  if (esercenti.length === 0) return null;

  const perEsercente = new Map(variazioni.esercenti.map((v) => [v.merchant_id, v as Variazione]));

  return (
    <section className="space-y-3">
      <h2 className="text-[17px] font-semibold tracking-[-0.02em]">Da chi</h2>
      <div className="scheda px-4">
        <ul className="elenco text-[15px]">
          {esercenti.map((e, i) => {
            const valore = centesimi(e.spesa);
            const riga = (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{e.esercente}</span>
                  <span className="text-[12px] text-testo-3">
                    {e.movimenti} {e.movimenti === 1 ? 'movimento' : 'movimenti'} ·{' '}
                    {e.discrezionalita}
                  </span>
                </span>
                <span className="cifra shrink-0 whitespace-nowrap">
                  {formattaEuro(valore)}
                  <Freccia
                    riga={e.merchant_id === null ? undefined : perEsercente.get(e.merchant_id)}
                  />
                </span>
              </>
            );
            return (
              <li key={`${e.merchant_id ?? 'nessuno'}-${e.discrezionalita}-${i}`}>
                {e.merchant_id === null ? (
                  <span className="flex min-h-12 items-center gap-3">{riga}</span>
                ) : (
                  <Link
                    href={`/esercente/${e.merchant_id}`}
                    className="flex min-h-12 items-center gap-3"
                  >
                    {riga}
                    <span aria-hidden="true" className="shrink-0 text-testo-3">
                      ›
                    </span>
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
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
      <p className="text-[12px] text-testo-3">
        {riga.banca}: ultimo movimento {riga.ultimo_movimento ?? '—'}
        {giorni !== null && ` · consenso valido ancora ${giorni} giorni`}
        {riga.movimenti_provvisori > 0 &&
          ` · ${riga.movimenti_provvisori} movimenti provvisori, l’importo può ancora cambiare`}
      </p>
    );
  }

  const tinta = grave ? 'var(--voluttuario)' : 'var(--utile)';

  return (
    <div
      className="scheda p-4 text-[14px]"
      style={{ background: `color-mix(in oklab, ${tinta} 12%, var(--s2))` }}
    >
      <p className="flex items-center gap-2 font-semibold">
        <span
          aria-hidden="true"
          className="size-2 shrink-0 rounded-full"
          style={{ background: tinta }}
        />
        {scaduto
          ? `Il consenso ${riga.banca} è scaduto da ${-(giorni ?? 0)} giorni.`
          : `Il consenso ${riga.banca} scade fra ${giorni} giorni.`}
      </p>
      <p className="mt-1.5 text-testo-2">
        {scaduto
          ? 'I movimenti nuovi non arrivano più, e i numeri smettono di aggiornarsi senza che nulla lo segnali. Va rinnovato dal '
          : 'Va rinnovato prima della scadenza, altrimenti i dati smettono di arrivare in silenzio. Si rinnova dal '}
        <Link className="text-essenziale" href="/debug/eb">
          pannello Enable Banking
        </Link>
        .
      </p>
      <p className="mt-1.5 text-[12px] text-testo-3">
        Ultimo movimento {riga.ultimo_movimento ?? '—'} · ultima sincronizzazione riuscita{' '}
        {riga.ultima_sync_riuscita?.slice(0, 10) ?? 'mai'}
        {riga.ultimo_errore !== null && ` · ultimo errore: ${riga.ultimo_errore}`}
      </p>
    </div>
  );
}
