'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CAMPO_PIENO } from '@/lib/ui/controlli';
import { Foglio } from '../foglio';

/**
 * Il selettore della metrica di «Nel tempo».
 *
 * Un grafico solo che cambia domanda, invece di venti grafici permanenti: la
 * capsula dice cosa si sta guardando e il foglio elenca cosa si puo' guardare
 * — il totale, ogni classe, il ricorrente per tipo, ogni categoria radice.
 *
 * La scelta e' un indirizzo (`?metrica=…`), non uno stato del browser: la
 * pagina resta un componente server, il grafico arriva gia' disegnato, e
 * un'analisi si puo' mandare a se' stessi come collegamento.
 */
export type OpzioneMetrica = {
  token: string;
  nome: string;
  /** Il titoletto del gruppo nel foglio, sulla prima voce che lo apre. */
  gruppo?: string;
};

export function SelettoreMetrica({
  attuale,
  nome,
  opzioni,
  verso,
}: {
  /** Il token della metrica in uso. */
  attuale: string;
  /** Il nome mostrato sulla capsula. */
  nome: string;
  opzioni: readonly OpzioneMetrica[];
  /** Il modello dell'indirizzo, con `%t` al posto del token. */
  verso: string;
}) {
  const [aperto, setAperto] = useState(false);
  const [ricerca, setRicerca] = useState('');

  // Con una quarantina di voci, scrivere tre lettere e' sempre piu' veloce che
  // scorrere — lo stesso conto gia' fatto per il selettore di categoria. Il
  // filtro e' in memoria: le opzioni arrivano gia' con la pagina. Mentre si
  // filtra i titoletti dei gruppi spariscono, o resterebbero appesi sopra
  // voci di un altro gruppo.
  const pulita = ricerca.trim().toLowerCase();
  const visibili =
    pulita === '' ? opzioni : opzioni.filter((o) => o.nome.toLowerCase().includes(pulita));

  function chiudi() {
    setAperto(false);
    setRicerca('');
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAperto(true)}
        className="capsula text-[14px] font-semibold"
      >
        <span className="max-w-48 truncate">{nome}</span>
        <span aria-hidden="true" className="text-[12px] font-normal text-testo-3">
          ⌄
        </span>
      </button>

      <Foglio aperto={aperto} titolo="Cosa guardare nel tempo" onChiudi={chiudi}>
        <div className="pb-2">
          <input
            className={CAMPO_PIENO}
            value={ricerca}
            onChange={(e) => setRicerca(e.target.value)}
            placeholder="Cerca una classe o una categoria"
            aria-label="Cerca fra le metriche"
          />
        </div>
        <ul className="elenco text-[15px]">
          {visibili.map((o) => (
            <li key={o.token}>
              {o.gruppo !== undefined && pulita === '' && (
                <p className="eti pt-3 pb-1">{o.gruppo}</p>
              )}
              <Link
                href={verso.replaceAll('%t', encodeURIComponent(o.token))}
                onClick={chiudi}
                aria-current={o.token === attuale ? 'true' : undefined}
                className="flex min-h-12 items-center gap-3"
              >
                <span className="min-w-0 flex-1 truncate">{o.nome}</span>
                {o.token === attuale && (
                  <span aria-hidden="true" className="shrink-0 text-accento">
                    ✓
                  </span>
                )}
              </Link>
            </li>
          ))}
          {visibili.length === 0 && (
            <li className="py-3 text-[13px] text-testo-3">Niente con questo nome.</li>
          )}
        </ul>
      </Foglio>
    </>
  );
}
