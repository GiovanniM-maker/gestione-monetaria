'use client';

import { useState } from 'react';
import Link from 'next/link';
import { etichettaMese } from '@/lib/cruscotto/mesi';
import { Foglio } from './foglio';

/**
 * La riga del mese: dove sei, e come ti sposti.
 *
 * Sta in un posto solo perche' la usano due schede — **Oggi** e **Dove** — e
 * due copie di una navigazione divergono alla prima modifica. Ognuna passa il
 * proprio `indirizzo`, cosi' cambiando mese si resta sulla scheda in cui si e'
 * invece di essere rimbalzati sull'altra.
 *
 * ---------------------------------------------------------------------------
 * Il titolo si apre, le frecce restano
 * ---------------------------------------------------------------------------
 * Con le sole frecce, tornare a febbraio da agosto costava sei tocchi ciechi:
 * la freccia dice «indietro» ma non dice **fino a dove si puo'** andare. Il
 * titolo con la cediglia apre il foglio con tutti i mesi che esistono, uno
 * sotto l'altro, col segno su quello che stai guardando: un tocco per vederli,
 * un tocco per andarci (docs/aspetto.md, Fetta 3).
 *
 * Le frecce restano per il gesto piu' comune — il mese accanto — che dal
 * foglio costerebbe due tocchi invece di uno.
 *
 * La pastiglia «in corso» prende il posto della freccia avanti quando il mese
 * e' quello che stiamo vivendo: una freccia verso un mese che non esiste
 * ancora e' un bersaglio che non fa niente, e un bersaglio che non fa niente
 * si preme lo stesso.
 */
export function SceltaMese({
  mese,
  mesi,
  precedente,
  successivo,
  inCorso,
  indirizzo,
  menu,
}: {
  mese: string;
  /** Tutti i mesi con dei dati, dal piu' vecchio: il foglio li rovescia. */
  mesi?: readonly string[];
  precedente: string | null;
  successivo: string | null;
  inCorso: boolean;
  /**
   * Il modello dell'indirizzo, con `%m` al posto del mese: `/?mese=%m`.
   *
   * Un modello e non una funzione: questo e' un componente client, e una
   * funzione non attraversa il confine col server — l'errore arriva a
   * runtime, sull'intera pagina.
   */
  indirizzo: string;
  /**
   * Il bottone del menu, quando questa riga fa da intestazione.
   *
   * Sulla home e su «Dove» la scritta «Gestione monetaria» non c'e' piu': il
   * posto in alto a sinistra e' del mese — che e' l'unica cosa che li' sopra
   * si tocca davvero — e il menu resta nell'angolo di sempre. Lo passa la
   * pagina perche' solo lei sa l'email e la versione; qui e' un nodo e basta.
   */
  menu?: React.ReactNode;
}) {
  const verso = (m: string) => indirizzo.replaceAll('%m', m);
  const [aperto, setAperto] = useState(false);
  const elenco = [...(mesi ?? [])].reverse();
  const apribile = elenco.length > 1;

  return (
    <div className="flex items-center gap-2">
      {/* La capsula, non un titolo: e' un bottone e si veste da bottone —
          la stessa superficie sollevata del tondo del menu, a mezzi cerchi
          come la barra di ricerca di Revolut. */}
      {apribile ? (
        <button
          type="button"
          onClick={() => setAperto(true)}
          className="capsula text-[15px] font-semibold tracking-[-0.02em]"
        >
          <span className="capitalize">{etichettaMese(mese)}</span>
          <span aria-hidden="true" className="text-[13px] font-normal text-testo-3">
            ⌄
          </span>
        </button>
      ) : (
        <p className="inline-flex min-h-11 items-center px-1 text-[15px] font-semibold tracking-[-0.02em]">
          <span className="capitalize">{etichettaMese(mese)}</span>
        </p>
      )}

      <nav className="ml-auto flex items-center gap-1">
        {precedente !== null && (
          <Link
            className="inline-flex size-11 items-center justify-center rounded-full text-testo-2"
            href={verso(precedente)}
            aria-label={`vai a ${etichettaMese(precedente)}`}
          >
            ‹
          </Link>
        )}
        {inCorso ? (
          <span className="pastiglia">in corso</span>
        ) : (
          successivo !== null && (
            <Link
              className="inline-flex size-11 items-center justify-center rounded-full text-testo-2"
              href={verso(successivo)}
              aria-label={`vai a ${etichettaMese(successivo)}`}
            >
              ›
            </Link>
          )
        )}
      </nav>

      {menu}

      {apribile && (
        <Foglio
          aperto={aperto}
          titolo="In che mese"
          nota="Solo i mesi in cui c’è almeno un movimento."
          onChiudi={() => setAperto(false)}
        >
          <ul className="elenco text-[15px]">
            {elenco.map((m, i) => (
              <li key={m}>
                {/* Un Link e non un bottone: cambiare mese e' un indirizzo, e
                    il foglio si chiude da solo perche' la navigazione lo
                    smonta. Il tocco chiude comunque, per il caso del mese in
                    cui si e' gia'. */}
                <Link
                  href={verso(m)}
                  onClick={() => setAperto(false)}
                  aria-current={m === mese ? 'true' : undefined}
                  className="flex min-h-12 items-center gap-3"
                >
                  <span className="min-w-0 flex-1 capitalize">{etichettaMese(m)}</span>
                  {i === 0 && (
                    <span className="shrink-0 text-[11px] text-testo-3">il più recente</span>
                  )}
                  {m === mese && (
                    <span aria-hidden="true" className="shrink-0 text-accento">
                      ✓
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </Foglio>
      )}
    </div>
  );
}
