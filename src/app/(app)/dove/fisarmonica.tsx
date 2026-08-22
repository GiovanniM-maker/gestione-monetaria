'use client';

import { useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { centesimiDi, formattaEuro } from '@/lib/abbonamenti/formato';
import { comeIcona, Icona } from '@/lib/ui/icone';
import { Freccia } from '../grafici';
import { spiegaErrore } from '@/lib/ui/errori';
import {
  categorieComeNodi,
  movimentiComeNodi,
  ricorrenzeComeNodi,
  rientro,
  type Apertura,
  type Nodo,
  type RigaMovimentoDove,
  type RigaRipartizione,
  type RigaVoceRicorrente,
} from '@/lib/dove/nodi';

export type { Nodo } from '@/lib/dove/nodi';

/**
 * La fisarmonica di «Dove»: si scende senza cambiare pagina.
 *
 * ---------------------------------------------------------------------------
 * Perche' una schermata sola
 * ---------------------------------------------------------------------------
 * La discesa era quattro pagine — classe, categoria, esercente, movimento — e
 * ognuna costava un caricamento e un tasto indietro. Ma la domanda «dove sono
 * finiti i soldi» non e' quattro domande: e' una sola, guardata da piu' vicino.
 * Aprire un ramo in loco tiene sotto gli occhi **il contesto** — quanto pesa
 * quel ramo sul totale, e cosa c'e' accanto — che e' precisamente
 * l'informazione che una pagina nuova butta via.
 *
 * ---------------------------------------------------------------------------
 * I figli si caricano alla prima apertura, e una volta sola
 * ---------------------------------------------------------------------------
 * Caricare tutto insieme vorrebbe dire, su un mese pieno, mille movimenti
 * spediti al browser perche' magari se ne guardano cinque. Ogni ramo chiede i
 * suoi figli al primo tocco e poi se li tiene: riaprirlo non ripaga il viaggio,
 * e chiuderlo non butta niente — chiudere e riaprire e' il gesto piu' comune
 * mentre si cerca qualcosa, e sarebbe il peggior momento per rifare una query.
 *
 * ---------------------------------------------------------------------------
 * Gli importi non passano da un float, nemmeno qui
 * ---------------------------------------------------------------------------
 * Arrivano dalla rete come stringhe decimali e diventano interi di centesimi
 * per essere sommati o confrontati. Le proporzioni delle barrette si calcolano
 * su `bigint`; i pixel sono float, e va bene — un pixel e' una posizione, non
 * un euro.
 */

type Stato =
  | { fase: 'in corso' }
  | { fase: 'pronto'; figli: readonly Nodo[] }
  | { fase: 'errore'; messaggio: string };

/** L'aspetto di una categoria, per il marchietto. La stessa forma di `leggiAspettoCategorie`. */
export type AspettoNodi = Readonly<Record<string, { icona: string | null; classe: string | null }>>;

export function Fisarmonica({
  mese,
  radici,
  aspetto,
  tinte,
}: {
  mese: string;
  radici: readonly Nodo[];
  /**
   * Icona e classe predefinita di ogni categoria: accende i marchietti sulle
   * righe di livello 1 e 2. Facoltativo — senza, le righe restano di testo,
   * che e' il degrado giusto finche' la 0049 non e' applicata.
   */
  aspetto?: AspettoNodi;
  /** Le tinte delle classi, per la velatura del marchietto. */
  tinte?: Readonly<Record<string, string>>;
}) {
  const [aperti, setAperti] = useState<ReadonlySet<string>>(new Set());
  const [caricati, setCaricati] = useState<ReadonlyMap<string, Stato>>(new Map());

  async function apri(nodo: Nodo) {
    const gia = aperti.has(nodo.chiave);
    setAperti((s) => {
      const n = new Set(s);
      if (gia) n.delete(nodo.chiave);
      else n.add(nodo.chiave);
      return n;
    });

    // Chiudere non scarica, e riaprire non richiede: il viaggio si paga una
    // volta sola. Chiudere e riaprire e' il gesto piu' comune mentre si cerca
    // qualcosa.
    if (gia || caricati.has(nodo.chiave) || nodo.apertura === null) return;

    // Il primo livello arriva gia' con la pagina (`precaricati`): il tocco
    // che lo apre non paga nessun viaggio, e la discesa si sente come un
    // accordion locale — che e' quello che e'.
    const pronti = nodo.precaricati;
    if (pronti !== undefined) {
      setCaricati((m) => new Map(m).set(nodo.chiave, { fase: 'pronto', figli: pronti }));
      return;
    }

    setCaricati((m) => new Map(m).set(nodo.chiave, { fase: 'in corso' }));
    try {
      const figli = await chiediFigli(mese, nodo.apertura);
      setCaricati((m) => new Map(m).set(nodo.chiave, { fase: 'pronto', figli }));
    } catch (e) {
      setCaricati((m) =>
        new Map(m).set(nodo.chiave, {
          fase: 'errore',
          messaggio: e instanceof Error ? e.message : String(e),
        }),
      );
    }
  }

  return (
    <div className="scheda px-4">
      <Rami
        nodi={radici}
        livello={0}
        aperti={aperti}
        caricati={caricati}
        apri={apri}
        aspetto={aspetto}
        tinte={tinte}
      />
    </div>
  );
}

function Rami({
  nodi,
  livello,
  aperti,
  caricati,
  apri,
  aspetto,
  tinte,
}: {
  nodi: readonly Nodo[];
  livello: number;
  aperti: ReadonlySet<string>;
  caricati: ReadonlyMap<string, Stato>;
  apri: (n: Nodo) => void;
  aspetto?: AspettoNodi;
  tinte?: Readonly<Record<string, string>>;
}) {
  // Il piu' pesante fra i fratelli, non il totale del mese: la barretta dice
  // «quanto pesa questo rispetto a quelli accanto», che e' la domanda che ci si
  // fa guardando un elenco. Sul totale del mese, sotto il terzo livello,
  // sarebbero tutte lunghe zero.
  const massimo = nodi.reduce((m, n) => {
    const v = modulo(centesimiDi(n.importo));
    return v > m ? v : m;
  }, 0n);

  return (
    <ul className="elenco">
      {nodi.map((n) => {
        const stato = caricati.get(n.chiave);
        const aperto = aperti.has(n.chiave);

        return (
          <li key={n.chiave}>
            <Riga
              nodo={n}
              aperto={aperto}
              massimo={massimo}
              inCorso={stato?.fase === 'in corso'}
              apri={apri}
              aspetto={aspetto}
              tinte={tinte}
            />

            {/* Il feedback immediato: il ramo si apre SUBITO, con due righe
                d'attesa della forma giusta, e i figli le sostituiscono quando
                arrivano. Un tocco che non muove niente per mezzo secondo si
                legge come un tocco non registrato, e si ripete. */}
            {aperto && stato?.fase === 'in corso' && (
              <div
                aria-hidden="true"
                className="ramo-aperto animate-pulse space-y-2.5 pt-1 pb-3"
                style={{ marginLeft: `${rientro(livello + 1)}px` }}
              >
                <span className="block h-3.5 w-2/3 rounded-full bg-s3" />
                <span className="block h-3.5 w-1/2 rounded-full bg-s3" />
              </div>
            )}

            {aperto && stato?.fase === 'errore' && (
              <p
                className="nota nota-errore mb-2 text-sec"
                style={{ marginLeft: `${rientro(livello + 1)}px` }}
              >
                {stato.messaggio}
              </p>
            )}

            {aperto && stato?.fase === 'pronto' && stato.figli.length === 0 && (
              <p
                className="pb-2 text-sec text-testo-2"
                style={{ marginLeft: `${rientro(livello + 1)}px` }}
              >
                Niente qui dentro.
              </p>
            )}

            {aperto && stato?.fase === 'pronto' && stato.figli.length > 0 && (
              <div className="ramo-aperto" style={{ marginLeft: `${rientro(livello + 1)}px` }}>
                <Rami
                  nodi={stato.figli}
                  livello={livello + 1}
                  aperti={aperti}
                  caricati={caricati}
                  apri={apri}
                  aspetto={aspetto}
                  tinte={tinte}
                />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Una riga.
 *
 * Alta almeno 48 px, che e' sopra il minimo di 44: e' la riga che si tocca piu'
 * spesso dell'applicazione, e su un elenco fitto quattro pixel in piu' sono la
 * differenza fra aprire il ramo che si voleva e aprire quello sotto.
 *
 * Un nodo che non si apre non diventa un bottone inerte: o e' un collegamento
 * (il movimento, che ha la sua scheda) o e' testo. Un tocco che non fa niente e'
 * peggio di un tocco che non c'e'.
 */
/**
 * Il marchietto di una categoria: la sua icona nel cerchietto, discreta.
 *
 * Le classi hanno la codifica forte (tessera, tinta piena); qui il glifo e'
 * monocromo e la tinta della classe predefinita entra solo come velatura del
 * fondo — un codice di riconoscimento, non un arcobaleno.
 */
function Marchietto({ icona, tinta }: { icona: string | null; tinta: string | null }) {
  const nome = comeIcona(icona) ?? 'punti';
  return (
    <span
      className="marchietto"
      style={tinta === null ? undefined : ({ '--tinta': tinta } as CSSProperties)}
    >
      <Icona nome={nome} misura={14} spessore={1.75} />
    </span>
  );
}

function Riga({
  nodo,
  aperto,
  massimo,
  inCorso,
  apri,
  aspetto,
  tinte,
}: {
  nodo: Nodo;
  aperto: boolean;
  massimo: bigint;
  inCorso: boolean;
  apri: (n: Nodo) => void;
  aspetto?: AspettoNodi;
  tinte?: Readonly<Record<string, string>>;
}) {
  const valore = centesimiDi(nodo.importo);
  const quota = massimo === 0n ? 0 : Number((modulo(valore) * 100n) / massimo);
  // Sbiadita per intero, non solo il nome: il non classificato non e' una
  // classe, e' un lavoro da fare, e deve leggersi a mezza voce anche in coda
  // all'occhio (docs/aspetto.md §4.3).
  const velo = nodo.sbiadito === true ? ' opacity-60' : '';

  // Che segno precede la riga: la tessera (classi), il marchietto (categorie,
  // se l'aspetto e' arrivato), il pallino (tinta e basta), o niente.
  const dellaCategoria =
    nodo.categoria !== undefined && aspetto !== undefined
      ? nodo.categoria === null
        ? null
        : (aspetto[nodo.categoria] ?? null)
      : undefined;
  const segno =
    nodo.tessera ??
    (dellaCategoria !== undefined ? (
      <Marchietto
        icona={dellaCategoria?.icona ?? null}
        tinta={dellaCategoria?.classe != null ? (tinte?.[dellaCategoria.classe] ?? null) : null}
      />
    ) : nodo.tinta !== null ? (
      <span className="block size-2.5 rounded-full" style={{ background: nodo.tinta }} />
    ) : null);

  const corpo = (
    <>
      {segno !== null && (
        <span aria-hidden="true" className="shrink-0">
          {segno}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-corpo">{nodo.etichetta}</span>
        <span className="mt-1 flex items-center gap-2">
          <span className="h-1 w-14 shrink-0 overflow-hidden rounded-full bg-s3">
            <span
              className="block h-full rounded-full"
              style={{ width: `${quota}%`, background: nodo.tinta ?? 'var(--testo-3)' }}
            />
          </span>
          {nodo.dettaglio !== null && (
            <span className="cifra truncate text-min text-testo-2">{nodo.dettaglio}</span>
          )}
        </span>
      </span>
      {/* Su due piani: importo sopra, delta sotto — cosi' il nome si allinea
          all'importo e la riga piccola alla percentuale. */}
      <span className="shrink-0 text-right">
        <span className="cifra block whitespace-nowrap">{formattaEuro(valore)}</span>
        <Freccia riga={nodo.variazione} sotto />
      </span>
    </>
  );

  if (nodo.apertura === null) {
    return nodo.href === null ? (
      <div className={`flex min-h-12 items-center gap-2.5 py-1.5${velo}`}>
        {corpo}
        <span aria-hidden="true" className="w-4 shrink-0" />
      </div>
    ) : (
      <Link href={nodo.href} className={`flex min-h-12 items-center gap-2.5 py-1.5${velo}`}>
        {corpo}
        <Icona nome="chevron" misura={16} className="shrink-0 text-testo-3" />
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => apri(nodo)}
      aria-expanded={aperto}
      className={`flex min-h-12 w-full items-center gap-2.5 py-1.5 text-left${velo}`}
    >
      {corpo}
      {/* Il segno ruota invece di cambiare: chi guarda segue lo stesso oggetto
          che si muove, e capisce che il ramo si e' aperto senza leggere. */}
      {/* Mentre arriva il ramo il segno **pulsa** invece di diventare un
          puntino: il puntino era un secondo glifo al posto del primo, cioe' un
          oggetto che sparisce e uno che compare — e chi guardava perdeva la
          cosa che stava seguendo. Cosi' resta lo stesso segno, e si vede che sta
          lavorando. */}
      <span
        aria-hidden="true"
        className={`shrink-0 text-testo-3 transition-transform duration-150${
          inCorso ? ' animate-pulse' : ''
        }`}
        style={{ transform: aperto ? 'rotate(90deg)' : 'none' }}
      >
        <Icona nome="chevron" misura={16} />
      </span>
    </button>
  );
}

function modulo(v: bigint): bigint {
  return v < 0n ? -v : v;
}

async function chiediFigli(mese: string, a: Apertura): Promise<readonly Nodo[]> {
  const q = new URLSearchParams({ mese, tipo: a.tipo });
  if (a.classe !== null) q.set('classe', a.classe);
  if (a.contesto !== null) q.set('contesto', a.contesto);
  if (a.categoria !== null) q.set('categoria', a.categoria);
  if ((a.tipo === 'movimenti' || a.tipo === 'ricorrenze') && a.soloQuesta) {
    q.set('solo_questa', '1');
  }
  // Il tipo di ricorrenza viaggia con OGNI richiesta del ramo: perderlo a un
  // livello mostrerebbe la spesa intera sotto un titolo che promette il
  // ricorrente — la lista plausibile e sbagliata.
  const ricorrenza =
    a.tipo === 'ricorrenze' ? a.ricorrenza : a.tipo === 'categorie' ? (a.ricorrenza ?? null) : null;
  if (ricorrenza !== null) q.set('ricorrenza', ricorrenza);

  const risposta = await fetch(`/api/admin/dove?${q.toString()}`);
  const dati = (await risposta.json()) as Record<string, unknown>;
  // Non il testo del server: la fisarmonica mostra questo messaggio dentro il
  // ramo che non si e' aperto, e «unauthorized» li' non direbbe niente a nessuno.
  if (!risposta.ok) throw new Error(spiegaErrore(risposta.status, dati).titolo);

  if (dati['tipo'] === 'movimenti') {
    return movimentiComeNodi((dati['righe'] as RigaMovimentoDove[] | undefined) ?? [], a.categoria);
  }
  if (dati['tipo'] === 'ricorrenze') {
    return ricorrenzeComeNodi(
      (dati['righe'] as RigaVoceRicorrente[] | undefined) ?? [],
      a.categoria,
    );
  }
  return categorieComeNodi(
    (dati['righe'] as RigaRipartizione[] | undefined) ?? [],
    mese,
    a.classe,
    a.contesto,
    ricorrenza,
  );
}
