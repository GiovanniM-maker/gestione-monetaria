'use client';

import { useState } from 'react';
import Link from 'next/link';
import { centesimiDi, formattaEuro } from '@/lib/abbonamenti/formato';
import { Freccia } from '../grafici';
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

export function Fisarmonica({ mese, radici }: { mese: string; radici: readonly Nodo[] }) {
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
      <Rami nodi={radici} livello={0} aperti={aperti} caricati={caricati} apri={apri} />
    </div>
  );
}

function Rami({
  nodi,
  livello,
  aperti,
  caricati,
  apri,
}: {
  nodi: readonly Nodo[];
  livello: number;
  aperti: ReadonlySet<string>;
  caricati: ReadonlyMap<string, Stato>;
  apri: (n: Nodo) => void;
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
            />

            {aperto && stato?.fase === 'errore' && (
              <p
                className="nota nota-errore mb-2 text-[13px]"
                style={{ marginLeft: `${rientro(livello + 1)}px` }}
              >
                {stato.messaggio}
              </p>
            )}

            {aperto && stato?.fase === 'pronto' && stato.figli.length === 0 && (
              <p
                className="pb-2 text-[13px] text-testo-3"
                style={{ marginLeft: `${rientro(livello + 1)}px` }}
              >
                Niente qui dentro.
              </p>
            )}

            {aperto && stato?.fase === 'pronto' && stato.figli.length > 0 && (
              <div style={{ marginLeft: `${rientro(livello + 1)}px` }}>
                <Rami
                  nodi={stato.figli}
                  livello={livello + 1}
                  aperti={aperti}
                  caricati={caricati}
                  apri={apri}
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
function Riga({
  nodo,
  aperto,
  massimo,
  inCorso,
  apri,
}: {
  nodo: Nodo;
  aperto: boolean;
  massimo: bigint;
  inCorso: boolean;
  apri: (n: Nodo) => void;
}) {
  const valore = centesimiDi(nodo.importo);
  const quota = massimo === 0n ? 0 : Number((modulo(valore) * 100n) / massimo);
  // Sbiadita per intero, non solo il nome: il non classificato non e' una
  // classe, e' un lavoro da fare, e deve leggersi a mezza voce anche in coda
  // all'occhio (docs/aspetto.md §4.3).
  const velo = nodo.sbiadito === true ? ' opacity-60' : '';

  const corpo = (
    <>
      {(nodo.tessera ?? nodo.tinta !== null) && (
        <span aria-hidden="true" className="shrink-0">
          {nodo.tessera ?? (
            <span
              className="block size-2.5 rounded-full"
              style={{ background: nodo.tinta ?? undefined }}
            />
          )}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px]">{nodo.etichetta}</span>
        <span className="mt-1 flex items-center gap-2">
          <span className="h-1 w-14 shrink-0 overflow-hidden rounded-full bg-s3">
            <span
              className="block h-full rounded-full"
              style={{ width: `${quota}%`, background: nodo.tinta ?? 'var(--testo-3)' }}
            />
          </span>
          {nodo.dettaglio !== null && (
            <span className="cifra truncate text-[12px] text-testo-3">{nodo.dettaglio}</span>
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
        <span aria-hidden="true" className="shrink-0 text-testo-3">
          ›
        </span>
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
      <span
        aria-hidden="true"
        className="shrink-0 text-testo-3 transition-transform duration-150"
        style={{ transform: aperto ? 'rotate(90deg)' : 'none' }}
      >
        {inCorso ? '·' : '›'}
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
  if (!risposta.ok) throw new Error(String(dati['error'] ?? risposta.status));

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
