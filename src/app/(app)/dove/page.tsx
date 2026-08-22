import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth/session';
import { VERSIONE } from '@/lib/versione';
import {
  leggiConfronto,
  leggiEsercenti,
  leggiFinestra,
  leggiRicorrente,
  leggiSpesaPerClasse,
  leggiTotali,
  leggiVariazioni,
  scegliMese,
} from '@/lib/cruscotto/letture';
import { etichettaBreve, etichettaMese, meseValido, quotaPercentuale } from '@/lib/cruscotto/mesi';
import { segnoDi, type VariazioneCategoria } from '@/lib/cruscotto/andamento';
import { formattaEuro, ordinaPerPeso, sommaCosti, totalePerTipo } from '@/lib/abbonamenti/formato';
import { leggiClassi } from '@/lib/tassonomia/classi';
import { categorieSceglibili } from '@/lib/tassonomia/categorie';
import {
  leggiAndamentoCategoria,
  leggiAndamentoClasse,
  leggiAndamentoRicorrente,
  leggiSpesaGiornaliera,
  type PuntoMensile,
} from '@/lib/dove/analitica';
import { estremiDelMese } from '@/lib/movimenti/filtri';
import { BOTTONE_MINORE } from '@/lib/ui/controlli';
import { Avatar } from '@/lib/ui/tessera';
import type { RigaClasse } from '@/lib/cruscotto/leggi';
import { ordineDelleClassi, tinteDelleClassi } from '../grafici';
import { GraficoCopilota } from '../copilota/grafico';
import { Ripartizione } from '../livello';
import { ScheletroElenco } from '../scheletri';
import { SceltaMese } from '../mese';
import { Menu } from '../menu';
import { Segmentato } from '../segmentato';
import { SelettoreMetrica, type OpzioneMetrica } from './selettore';
import { Icona } from '@/lib/ui/icone';
import { Vuoto } from '@/lib/ui/vuoto';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Dove' };

/**
 * «Dove» cambia mestiere: non un altro elenco, ma l'analisi.
 *
 * ---------------------------------------------------------------------------
 * La domanda non e' piu' solo «dove ho speso»
 * ---------------------------------------------------------------------------
 * E' anche: QUANDO sto spendendo (il mese giorno per giorno), in cosa sto
 * CRESCENDO e cosa sta calando (nel tempo, con una metrica a scelta), quanto
 * pesa il ricorrente su scala annuale, e cosa merita un'occhiata (gli
 * insight). La discesa classe → categorie → movimenti sta sulla home: qui
 * si guarda il movimento nel tempo, non la composizione di un totale.
 *
 * ---------------------------------------------------------------------------
 * Un grafico che cambia domanda, non venti grafici
 * ---------------------------------------------------------------------------
 * «Nel tempo» e' UNA figura con un selettore — totale, ogni classe, il
 * ricorrente per tipo, ogni categoria — e una finestra (3/6/12 mesi). Sta
 * nell'indirizzo (`?metrica=…&finestra=…`): la pagina resta un componente
 * server e un'analisi si manda come collegamento.
 *
 * I valori dentro le figure escono TUTTI da SQL (le viste mensili e le
 * funzioni della 0052); la geometria e' quella della Fase 10, con lo zero
 * sempre nel dominio — un grafico che parte dal minimo osservato fa sembrare
 * un crollo una variazione del 3%.
 */

const FINESTRE = ['3', '6', '12'] as const;
type Finestra = (typeof FINESTRE)[number];

const SLUG = /^[a-z0-9][a-z0-9-]{0,60}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Metrica =
  | { tipo: 'totale' }
  | { tipo: 'classe'; slug: string }
  | { tipo: 'categoria'; id: string }
  | { tipo: 'ricorrente'; ricorrenza: 'abbonamento' | 'abitudine' };

function leggiMetrica(v: string | string[] | undefined): Metrica {
  if (typeof v !== 'string') return { tipo: 'totale' };
  if (v === 'abbonamenti') return { tipo: 'ricorrente', ricorrenza: 'abbonamento' };
  if (v === 'abitudini') return { tipo: 'ricorrente', ricorrenza: 'abitudine' };
  if (v.startsWith('classe:')) {
    const slug = v.slice('classe:'.length);
    if (SLUG.test(slug) || slug === 'non classificato') return { tipo: 'classe', slug };
  }
  if (v.startsWith('categoria:')) {
    const id = v.slice('categoria:'.length);
    if (UUID.test(id)) return { tipo: 'categoria', id };
  }
  return { tipo: 'totale' };
}

function token(m: Metrica): string {
  switch (m.tipo) {
    case 'totale':
      return 'totale';
    case 'classe':
      return `classe:${m.slug}`;
    case 'categoria':
      return `categoria:${m.id}`;
    case 'ricorrente':
      return m.ricorrenza === 'abbonamento' ? 'abbonamenti' : 'abitudini';
  }
}

function leggiFinestraMesi(v: string | string[] | undefined): Finestra {
  return typeof v === 'string' && (FINESTRE as readonly string[]).includes(v)
    ? (v as Finestra)
    : '12';
}

function centesimi(valore: string | null): bigint {
  const { totale, nonLetti } = sommaCosti([valore]);
  return nonLetti > 0 ? 0n : totale;
}

export default async function DovePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parametri = await searchParams;
  const metrica = leggiMetrica(parametri['metrica']);
  const finestra = leggiFinestraMesi(parametri['finestra']);
  const user = await requireUser();
  const { mese, rigaMese, mesiDisponibili, mesePrecedente, meseSuccessivo, inCorso, totali } =
    await scegliMese(meseValido(parametri['mese']));

  const periodo = estremiDelMese(mese);
  const versoMovimenti =
    periodo === null ? '/movimenti' : `/movimenti?da=${periodo.da}&a=${periodo.a}`;

  return (
    <div className="space-y-9">
      <SceltaMese
        mese={mese}
        mesi={mesiDisponibili}
        precedente={mesePrecedente}
        successivo={meseSuccessivo}
        inCorso={inCorso}
        indirizzo={`/dove?mese=%m&metrica=${encodeURIComponent(token(metrica))}&finestra=${finestra}`}
        menu={<Menu email={user.email ?? null} versione={VERSIONE} />}
      />

      {/* L'eroe senza carta, come sulla home: quanto, e QUANDO. */}
      <div className="space-y-4 px-1">
        <div className="space-y-3 py-2 text-center">
          <p className="eti">
            speso in {etichettaMese(mese)}
            {rigaMese !== null && ` · ${rigaMese.movimenti} movimenti`}
          </p>
          <p className="numerone text-[44px] whitespace-nowrap sm:text-[52px]">
            {formattaEuro(centesimi(rigaMese?.spesa ?? null))}
          </p>
          <p>
            <Link className={BOTTONE_MINORE} href={versoMovimenti}>
              tutti i movimenti del mese
            </Link>
          </p>
        </div>
        <Suspense fallback={<ScheletroElenco righe={2} />}>
          <GiornoPerGiorno mese={mese} inCorso={inCorso} />
        </Suspense>
      </div>

      <Suspense fallback={<ScheletroElenco />}>
        <Composizione mese={mese} finestra={finestra} />
      </Suspense>

      <Suspense fallback={<ScheletroElenco />}>
        <NelTempo mese={mese} metrica={metrica} finestra={finestra} />
      </Suspense>

      <Suspense fallback={<ScheletroElenco righe={3} />}>
        <RicorrenteAnnuale />
      </Suspense>

      <Suspense fallback={null}>
        <Insight mese={mese} totali={totali.length} />
      </Suspense>

      <Suspense fallback={<ScheletroElenco />}>
        <DaChi mese={mese} />
      </Suspense>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Il mese, giorno per giorno                                                  */
/* -------------------------------------------------------------------------- */

async function GiornoPerGiorno({ mese, inCorso }: { mese: string; inCorso: boolean }) {
  let righe;
  try {
    righe = await leggiSpesaGiornaliera(mese);
  } catch (errore) {
    return (
      <p className="nota nota-errore text-sec">
        Il grafico giornaliero non arriva:{' '}
        {errore instanceof Error ? errore.message : String(errore)}
      </p>
    );
  }
  if (righe.length === 0) return null;

  const periodo = estremiDelMese(mese);
  if (periodo === null) return null;
  const perGiorno = new Map(righe.map((r) => [r.giorno, r.spesa]));

  // I buchi si riempiono con lo zero: un giorno senza spese e' un fatto, non
  // un'assenza dall'asse. Nel mese in corso pero' ci si ferma all'ultimo
  // giorno con dei dati: disegnare a zero i giorni che devono ancora venire
  // farebbe sembrare che la spesa si sia fermata.
  const ultimoDelMese = Number(periodo.a.slice(8, 10));
  const ultimoConDati = Number((righe[righe.length - 1]?.giorno ?? periodo.a).slice(8, 10));
  const fine = inCorso ? ultimoConDati : ultimoDelMese;

  const punti = Array.from({ length: fine }, (_, i) => {
    const giorno = `${mese}-${String(i + 1).padStart(2, '0')}`;
    return { etichetta: String(i + 1), valore: perGiorno.get(giorno) ?? '0' };
  });

  return (
    <GraficoCopilota
      grafico={{
        titolo: 'Giorno per giorno',
        tipo: 'barre',
        serie: [{ nome: 'spesa', punti }],
        ...(inCorso ? { nota: 'Fino a oggi: il mese non è finito.' } : {}),
      }}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* La composizione: dove sono andati i soldi                                   */
/* -------------------------------------------------------------------------- */

/** I contesti si sommano per classe, come sulla barra della home. */
function perClasse(classi: readonly RigaClasse[], ordine: readonly string[]) {
  const somma = (r: readonly RigaClasse[]) => r.reduce((s, c) => s + centesimi(c.spesa), 0n);
  const note = ordine.map((slug) => ({
    slug,
    valore: somma(classi.filter((c) => c.discrezionalita === slug)),
  }));
  const resto = classi.filter((c) => !ordine.includes(c.discrezionalita));
  return resto.length === 0 ? note : [...note, { slug: 'non classificato', valore: somma(resto) }];
}

async function Composizione({ mese, finestra }: { mese: string; finestra: Finestra }) {
  const [classi, definizioni] = await Promise.all([leggiSpesaPerClasse(mese), leggiClassi()]);
  if (classi.length === 0) {
    return (
      <Vuoto
        nudo
        titolo="Niente da scomporre"
        perche="In questo mese non ci sono spese reali: o non è ancora arrivato niente, o quello che è arrivato sono tutti giroconti."
      />
    );
  }

  const tinte = tinteDelleClassi(definizioni);
  const nomi = Object.fromEntries(definizioni.map((d) => [d.slug, d.nome]));
  const voci = perClasse(classi, ordineDelleClassi(definizioni)).filter((v) => v.valore !== 0n);
  const totale = voci.reduce((s, v) => s + v.valore, 0n);

  return (
    <section className="space-y-3">
      <h2 className="eti px-1">Dove sono andati i soldi</h2>
      <div className="scheda p-4">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-6">
          <Anello
            voci={voci.map((v) => ({
              chiave: v.slug,
              valore: v.valore,
              tinta: tinte[v.slug] ?? 'var(--neutro)',
            }))}
            totale={totale}
          />
          <ul className="elenco w-full min-w-0 flex-1 text-corpo">
            {voci.map((v) => {
              const residuale = v.slug === 'non classificato';
              return (
                <li key={v.slug}>
                  {/* Il tocco non apre le transazioni: punta il grafico «nel
                      tempo» su questa classe — qui si analizza, la discesa
                      sta sulla home. */}
                  <Link
                    href={`/dove?mese=${mese}&metrica=${encodeURIComponent(`classe:${v.slug}`)}&finestra=${finestra}#neltempo`}
                    className={`flex min-h-12 items-center gap-2.5 ${residuale ? 'opacity-60' : ''}`}
                  >
                    <span
                      aria-hidden="true"
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ background: tinte[v.slug] ?? 'var(--neutro)' }}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {nomi[v.slug] ??
                        (v.slug === 'non classificato' ? 'Non classificato' : v.slug)}
                    </span>
                    {/* La quota in grigio neutro: e' contesto, non un dato di
                        classe (docs/aspetto.md §4.4). */}
                    <span className="cifra w-12 shrink-0 text-right text-sec text-testo-3">
                      {quotaPercentuale(v.valore, totale).toFixed(0)}%
                    </span>
                    <span className="cifra shrink-0 whitespace-nowrap">
                      {formattaEuro(v.valore)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}

/**
 * L'anello della composizione. `aria-hidden`: tutto cio' che dice sta
 * nell'elenco accanto in forma di testo, e la figura non e' il bersaglio.
 */
function Anello({
  voci,
  totale,
}: {
  voci: readonly { chiave: string; valore: bigint; tinta: string }[];
  totale: bigint;
}) {
  const LATO = 120;
  const RAGGIO = 44;
  const SPESSORE = 16;
  const circonferenza = 2 * Math.PI * RAGGIO;
  const modulo = (v: bigint) => (v < 0n ? -v : v);
  const somma = voci.reduce((s, v) => s + modulo(v.valore), 0n);
  if (somma === 0n) return null;

  // La proporzione e' una posizione, non un euro: qui il float va bene.
  const quote = voci.map((v) => Number(modulo(v.valore)) / Number(somma));
  const archi = voci.map((v, i) => ({
    ...v,
    tratto: (quote[i] ?? 0) * circonferenza,
    scostamento: -quote.slice(0, i).reduce((a, b) => a + b, 0) * circonferenza,
  }));

  return (
    <div className="relative shrink-0">
      <svg viewBox={`0 0 ${LATO} ${LATO}`} className="size-40" aria-hidden="true">
        <g transform={`rotate(-90 ${LATO / 2} ${LATO / 2})`}>
          {archi.map((a) => (
            <circle
              key={a.chiave}
              cx={LATO / 2}
              cy={LATO / 2}
              r={RAGGIO}
              fill="none"
              strokeWidth={SPESSORE}
              stroke={a.tinta}
              strokeDasharray={`${a.tratto} ${circonferenza - a.tratto}`}
              strokeDashoffset={a.scostamento}
              strokeLinecap="butt"
            />
          ))}
        </g>
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="cifra text-sec font-semibold">{formattaEuro(totale)}</span>
        <span className="text-eti text-testo-3">nel mese</span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Nel tempo                                                                   */
/* -------------------------------------------------------------------------- */

async function NelTempo({
  mese,
  metrica,
  finestra,
}: {
  mese: string;
  metrica: Metrica;
  finestra: Finestra;
}) {
  const [definizioni, categorie] = await Promise.all([leggiClassi(), categorieSceglibili()]);

  // Le opzioni del selettore: il totale, ogni classe, il ricorrente per tipo,
  // ogni categoria. L'elenco vero, non una costante: le classi e le categorie
  // si creano mentre l'app e' accesa.
  const opzioni: OpzioneMetrica[] = [
    { token: 'totale', nome: 'Totale' },
    ...definizioni
      .filter((d) => !d.is_archived)
      .map((d, i) => ({
        token: `classe:${d.slug}`,
        nome: d.nome,
        ...(i === 0 ? { gruppo: 'Per classe' } : {}),
      })),
    { token: 'abbonamenti', nome: 'Abbonamenti', gruppo: 'Ricorrente' },
    { token: 'abitudini', nome: 'Abitudini' },
    ...categorie.map((c, i) => ({
      token: `categoria:${c.id}`,
      nome: c.percorso,
      ...(i === 0 ? { gruppo: 'Per categoria' } : {}),
    })),
  ];

  const nome =
    metrica.tipo === 'totale'
      ? 'Totale'
      : metrica.tipo === 'classe'
        ? (definizioni.find((d) => d.slug === metrica.slug)?.nome ??
          (metrica.slug === 'non classificato' ? 'Non classificato' : metrica.slug))
        : metrica.tipo === 'categoria'
          ? (categorie.find((c) => c.id === metrica.id)?.percorso ?? 'Una categoria')
          : metrica.ricorrenza === 'abbonamento'
            ? 'Abbonamenti'
            : 'Abitudini';

  let serie: readonly PuntoMensile[];
  try {
    serie = await leggiSerie(metrica);
  } catch (errore) {
    return (
      <SezioneNelTempo
        mese={mese}
        metrica={metrica}
        finestra={finestra}
        nome={nome}
        opzioni={opzioni}
      >
        <p className="nota nota-errore text-sec">
          L&rsquo;andamento non arriva: {errore instanceof Error ? errore.message : String(errore)}
        </p>
      </SezioneNelTempo>
    );
  }

  const ultime = serie.slice(-Number(finestra));

  return (
    <SezioneNelTempo
      mese={mese}
      metrica={metrica}
      finestra={finestra}
      nome={nome}
      opzioni={opzioni}
    >
      {ultime.length < 2 ? (
        <p className="px-1 text-sec text-testo-3">
          Non ci sono abbastanza mesi con dei dati per disegnare {nome.toLowerCase()}.
        </p>
      ) : (
        <GraficoCopilota
          grafico={{
            titolo: `${nome} · ultimi ${ultime.length} mesi`,
            tipo: 'linee',
            serie: [
              {
                nome,
                punti: ultime.map((p) => ({ etichetta: etichettaBreve(p.mese), valore: p.spesa })),
              },
            ],
            nota: 'Il mese in corso è parziale.',
          }}
        />
      )}
    </SezioneNelTempo>
  );
}

async function leggiSerie(metrica: Metrica): Promise<readonly PuntoMensile[]> {
  switch (metrica.tipo) {
    case 'totale':
      return (await leggiTotali()).map((r) => ({ mese: r.mese, spesa: r.spesa }));
    case 'classe':
      return leggiAndamentoClasse(metrica.slug);
    case 'categoria':
      return leggiAndamentoCategoria(metrica.id);
    case 'ricorrente':
      return leggiAndamentoRicorrente(metrica.ricorrenza);
  }
}

function SezioneNelTempo({
  mese,
  metrica,
  finestra,
  nome,
  opzioni,
  children,
}: {
  mese: string;
  metrica: Metrica;
  finestra: Finestra;
  nome: string;
  opzioni: readonly OpzioneMetrica[];
  children: React.ReactNode;
}) {
  return (
    <section id="neltempo" className="scroll-mt-4 space-y-3">
      <h2 className="eti px-1">Nel tempo</h2>
      <div className="flex flex-wrap items-center gap-2">
        <SelettoreMetrica
          attuale={token(metrica)}
          nome={nome}
          opzioni={opzioni}
          verso={`/dove?mese=${mese}&metrica=%t&finestra=${finestra}#neltempo`}
        />
        <div className="min-w-40 flex-1">
          <Segmentato
            etichetta="Quanti mesi guardare"
            voci={FINESTRE.map((f) => ({
              chiave: f,
              testo: `${f} mesi`,
              attiva: f === finestra,
              href: `/dove?mese=${mese}&metrica=${encodeURIComponent(token(metrica))}&finestra=${f}#neltempo`,
            }))}
          />
        </div>
      </div>
      {children}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Il ricorrente, su scala annuale                                             */
/* -------------------------------------------------------------------------- */

async function RicorrenteAnnuale() {
  const voci = ordinaPerPeso(await leggiRicorrente());
  const abbonamenti = totalePerTipo(voci, 'abbonamento');
  const abitudini = totalePerTipo(voci, 'abitudine');
  if (abbonamenti === 0n && abitudini === 0n) return null;

  let serie: { abbonamenti: readonly PuntoMensile[]; abitudini: readonly PuntoMensile[] } | null;
  try {
    const [a, b] = await Promise.all([
      leggiAndamentoRicorrente('abbonamento'),
      leggiAndamentoRicorrente('abitudine'),
    ]);
    serie = { abbonamenti: a, abitudini: b };
  } catch {
    // Senza la 0052 il grafico manca, ma i totali annuali no: si mostra
    // quello che c'e', e il buco si vede — non si tace.
    serie = null;
  }

  return (
    <section className="space-y-3">
      <h2 className="eti px-1">Costi ricorrenti, su un anno</h2>
      <div className="grid grid-cols-2 gap-3">
        <Link href="/ricorrente/abbonamento" className="scheda p-4">
          <p className="text-sec text-testo-2">Abbonamenti</p>
          <p className="numerone mt-1.5 text-sez whitespace-nowrap">
            {formattaEuro(abbonamenti * 12n)}
          </p>
          <p className="mt-1.5 text-min text-testo-3">all&rsquo;anno, al ritmo di oggi</p>
        </Link>
        <Link href="/ricorrente/abitudine" className="scheda p-4">
          <p className="text-sec text-testo-2">Abitudini</p>
          <p className="numerone mt-1.5 text-sez whitespace-nowrap">
            {formattaEuro(abitudini * 12n)}
          </p>
          <p className="mt-1.5 text-min text-testo-3">all&rsquo;anno, al ritmo di oggi</p>
        </Link>
      </div>
      <p className="px-1 text-min text-testo-3">
        Dodici volte il costo mensile misurato su tutto lo storico — un ritmo, non una previsione.
      </p>

      {serie !== null && <GraficoRicorrente serie={serie} />}
    </section>
  );
}

/**
 * Le due serie sullo STESSO asse dei mesi, coi buchi a zero.
 *
 * La geometria disegna ogni serie sulla propria lunghezza: due serie che
 * coprono mesi diversi finirebbero disallineate — gennaio di una sotto marzo
 * dell'altra — e un grafico disallineato mente con numeri veri.
 */
function GraficoRicorrente({
  serie,
}: {
  serie: { abbonamenti: readonly PuntoMensile[]; abitudini: readonly PuntoMensile[] };
}) {
  const mesi = [...new Set([...serie.abbonamenti, ...serie.abitudini].map((p) => p.mese))].sort();
  if (mesi.length < 2) return null;

  const su = (righe: readonly PuntoMensile[]) => {
    const perMese = new Map(righe.map((p) => [p.mese, p.spesa]));
    return mesi.map((m) => ({ etichetta: etichettaBreve(m), valore: perMese.get(m) ?? '0' }));
  };

  return (
    <GraficoCopilota
      grafico={{
        titolo: 'Quanto è uscito ogni mese verso i ricorrenti',
        tipo: 'linee',
        serie: [
          { nome: 'Abbonamenti', punti: su(serie.abbonamenti) },
          { nome: 'Abitudini', punti: su(serie.abitudini) },
        ],
        nota: 'Spesa reale per mese verso gli esercenti ricorrenti. Il mese in corso è parziale.',
      }}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Gli insight                                                                 */
/* -------------------------------------------------------------------------- */

type Carta = { titolo: string; corpo: string; href: string | null };

/**
 * Due-quattro cose che meritano un'occhiata, non una lista.
 *
 * Ogni cifra viene da SQL: le percentuali sono le stesse `variazione_pct`
 * delle frecce (mediana scelta come riferimento, mai la media), e il
 * confronto del mese e' quello della home — stesse finestre, stessi numeri.
 * Qui si SCEGLIE cosa dire, non si calcola cosa dire.
 */
async function Insight({ mese, totali }: { mese: string; totali: number }) {
  const [variazioni, confronto, { giorniCoperti }] = await Promise.all([
    leggiVariazioni(mese),
    leggiConfronto(mese),
    leggiFinestra(mese),
  ]);

  const carte: Carta[] = [];

  if (confronto !== null && confronto.riferimento !== null && confronto.scostamento !== null) {
    const sopra = confronto.scostamento > 0;
    carte.push({
      titolo: sopra ? 'Mese sopra il solito' : 'Mese sotto il solito',
      corpo:
        `Nei primi ${giorniCoperti ?? '—'} giorni hai speso il ` +
        `${Math.abs(confronto.scostamento).toFixed(0)}% ${sopra ? 'in più' : 'in meno'} ` +
        `del solito (${formattaEuro(confronto.riferimento)} sugli stessi giorni).`,
      href: null,
    });
  }

  // La categoria che sta crescendo di piu', e quella che sta calando: solo
  // con abbastanza mesi di confronto, e col testo del segno gia' calcolato
  // in SQL — lo stesso delle frecce.
  const affidabili = variazioni.categorie.filter(
    (v): v is VariazioneCategoria =>
      v.variazione_pct !== null && v.mesi_di_confronto >= 3 && segnoDi(v) !== null,
  );
  const perPct = [...affidabili].sort(
    (a, b) => Number(a.variazione_pct) - Number(b.variazione_pct),
  );
  const cala = perPct[0];
  const cresce = perPct[perPct.length - 1];

  if (cresce !== undefined && Number(cresce.variazione_pct) > 10) {
    const segno = segnoDi(cresce);
    carte.push({
      titolo: `${cresce.categoria} sta crescendo`,
      corpo: `${segno?.testo ?? ''} rispetto al suo mese tipico, su ${cresce.mesi_di_confronto} mesi di confronto.`,
      href: `/categoria/${cresce.category_id}?mese=${mese}`,
    });
  }
  if (cala !== undefined && cala !== cresce && Number(cala.variazione_pct) < -10) {
    const segno = segnoDi(cala);
    carte.push({
      titolo: `${cala.categoria} sta calando`,
      corpo: `${segno?.testo ?? ''} rispetto al suo mese tipico, su ${cala.mesi_di_confronto} mesi di confronto.`,
      href: `/categoria/${cala.category_id}?mese=${mese}`,
    });
  }

  // Il ricorrente nel tempo: il primo e l'ultimo mese INTERO della serie,
  // detti con i loro numeri — nessuna percentuale inventata qui.
  try {
    const abb = (await leggiAndamentoRicorrente('abbonamento')).slice(0, -1);
    const primo = abb[0];
    const ultimo = abb[abb.length - 1];
    if (primo !== undefined && ultimo !== undefined && primo.mese !== ultimo.mese) {
      carte.push({
        titolo: 'Abbonamenti nel tempo',
        corpo:
          `Verso gli abbonamenti sono usciti ${formattaEuro(centesimi(primo.spesa))} a ` +
          `${etichettaBreve(primo.mese)} e ${formattaEuro(centesimi(ultimo.spesa))} a ` +
          `${etichettaBreve(ultimo.mese)}.`,
        href: '/ricorrente/abbonamento',
      });
    }
  } catch {
    // Senza la 0052 questo insight semplicemente non c'e'.
  }

  if (carte.length === 0 || totali < 2) return null;

  return (
    <section className="space-y-3">
      <h2 className="eti px-1">Da guardare</h2>
      <div className="space-y-2">
        {carte.slice(0, 4).map((c) =>
          c.href === null ? (
            <div key={c.titolo} className="scheda p-4">
              <p className="text-sec font-semibold">{c.titolo}</p>
              <p className="mt-1 text-sec text-testo-2">{c.corpo}</p>
            </div>
          ) : (
            <Link key={c.titolo} href={c.href} className="scheda flex items-center gap-3 p-4">
              <span className="min-w-0 flex-1">
                <span className="block text-sec font-semibold">{c.titolo}</span>
                <span className="mt-1 block text-sec text-testo-2">{c.corpo}</span>
              </span>
              <Icona nome="chevron" misura={16} className="shrink-0 text-testo-3" />
            </Link>
          ),
        )}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Da chi                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Da chi: l'unica domanda che la discesa della home non sa rispondere,
 * perche' un esercente attraversa le categorie.
 */
async function DaChi({ mese }: { mese: string }) {
  const [esercenti, definizioni] = await Promise.all([leggiEsercenti(mese), leggiClassi()]);
  if (esercenti.length === 0) return null;
  const tinte = tinteDelleClassi(definizioni);

  return (
    <Ripartizione
      titolo="Da chi"
      voci={esercenti.map((e, i) => ({
        chiave: `${e.merchant_id ?? 'nessuno'}-${e.discrezionalita}-${i}`,
        etichetta: e.esercente,
        dettaglio: `${e.movimenti} ${e.movimenti === 1 ? 'movimento' : 'movimenti'}`,
        valore: centesimi(e.spesa),
        href: e.merchant_id === null ? null : `/esercente/${e.merchant_id}`,
        // L'iniziale sulla velatura della sua classe: deterministico e locale,
        // nessun logo chiesto a un terzo (docs/aspetto.md §3.5).
        tessera: (
          <Avatar
            nome={e.esercente}
            tinta={
              e.discrezionalita !== null
                ? (tinte[e.discrezionalita] ?? 'var(--neutro)')
                : 'var(--neutro)'
            }
          />
        ),
      }))}
    />
  );
}
