'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';

/**
 * L'avviso passeggero: cosa è successo, e come disfarlo.
 *
 * ---------------------------------------------------------------------------
 * Perché esiste
 * ---------------------------------------------------------------------------
 * Fino al 22 agosto 2026 la conseguenza di ogni gesto era «la pagina si
 * ridisegna»: 28 `router.refresh()` e nessun annulla. A cache appena invalidata
 * è anche la cosa più lenta che l'applicazione faccia, e soprattutto non dice
 * **cosa** è cambiato: la riga sparisce e basta.
 *
 * Qui la riga sparisce subito — l'aggiornamento è ottimistico — e questo dice
 * cosa è successo e offre di rimetterla dov'era.
 *
 * ---------------------------------------------------------------------------
 * Le regole, e da dove vengono
 * ---------------------------------------------------------------------------
 * - **Uno alla volta.** Una pila di avvisi coprirebbe la lista che si sta
 *   lavorando, che è esattamente lo schermo su cui si sta guardando.
 * - **Una sola azione.** È la forma dello snackbar di Material 3, e la ragione
 *   è che due azioni in una riga da leggere in sei secondi non si scelgono.
 * - **Sei secondi con l'annulla, due e mezzo senza.** Sotto i sei non si fa in
 *   tempo a decidere; sopra, resta a coprire la barra mentre si continua.
 * - **Non blocca niente.** Sta sopra la barra, non sopra il contenuto, e non
 *   ruba il fuoco: chi non lo guarda continua a lavorare e non se ne accorge.
 * - **Sparisce cambiando schermata.** Un annulla che sopravvive alla
 *   navigazione disferebbe una cosa che non si sta più guardando.
 *
 * ---------------------------------------------------------------------------
 * Uno store fuori da React, e perché
 * ---------------------------------------------------------------------------
 * L'avviso lo chiede una riga in fondo a un elenco e lo mostra un componente
 * montato nel layout: passarlo per props significherebbe attraversare cinque
 * livelli di componenti che non c'entrano niente, e lo stack vieta i gestori di
 * stato. `useSyncExternalStore` è il modo previsto di leggere uno store esterno
 * senza inventarne uno.
 */

export type Avviso = {
  testo: string;
  /** Se c'è, compare «Annulla». Può essere lenta: l'avviso resta finché non finisce. */
  annulla?: (() => void | Promise<void>) | undefined;
  tono?: 'esito' | 'errore';
};

type Stato = (Avviso & { chiave: number }) | null;

let corrente: Stato = null;
let scadenza: ReturnType<typeof setTimeout> | null = null;
let prossimaChiave = 1;
const ascoltatori = new Set<() => void>();

function pubblica(nuovo: Stato): void {
  corrente = nuovo;
  for (const a of ascoltatori) a();
}

/** Con un'azione servono sei secondi per decidere; senza, basta leggere. */
const CON_AZIONE_MS = 6000;
const SENZA_AZIONE_MS = 2500;

export function avvisa(avviso: Avviso): void {
  if (scadenza !== null) clearTimeout(scadenza);
  pubblica({ ...avviso, chiave: prossimaChiave++ });
  const durata = avviso.annulla === undefined ? SENZA_AZIONE_MS : CON_AZIONE_MS;
  scadenza = setTimeout(() => pubblica(null), durata);
}

export function chiudiAvviso(): void {
  if (scadenza !== null) clearTimeout(scadenza);
  scadenza = null;
  pubblica(null);
}

function sottoscrivi(cambia: () => void): () => void {
  ascoltatori.add(cambia);
  return () => ascoltatori.delete(cambia);
}
const leggi = (): Stato => corrente;
const leggiSulServer = (): Stato => null;

export function Avvisi() {
  const avviso = useSyncExternalStore(sottoscrivi, leggi, leggiSulServer);
  const inCorso = useRef(false);

  // Cambiando schermata l'avviso se ne va: un annulla che sopravvive alla
  // navigazione disferebbe una cosa che non si sta più guardando.
  useEffect(() => chiudiAvviso, []);

  if (avviso === null) return null;

  const errore = avviso.tono === 'errore';

  return (
    <div
      // `polite` e non `assertive`: è una conferma, non un allarme, e non deve
      // interrompere ciò che un lettore di schermo sta già dicendo.
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-50 flex justify-center"
    >
      <div
        key={avviso.chiave}
        className={`galleggiante pointer-events-auto flex w-full max-w-md items-center gap-3 px-4 py-3 text-sec ${
          errore ? 'nota-errore' : 'bg-s3'
        }`}
      >
        <span className="min-w-0 flex-1">{avviso.testo}</span>
        {avviso.annulla !== undefined && (
          <button
            type="button"
            className="-mr-1 min-h-11 shrink-0 rounded-full px-2 text-sec font-bold text-accento sm:min-h-9"
            onClick={() => {
              // Due tocchi rapidi su «Annulla» non devono disfare due volte.
              if (inCorso.current) return;
              inCorso.current = true;
              void Promise.resolve(avviso.annulla?.()).finally(() => {
                inCorso.current = false;
                chiudiAvviso();
              });
            }}
          >
            Annulla
          </button>
        )}
      </div>
    </div>
  );
}
