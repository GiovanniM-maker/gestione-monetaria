/**
 * Le classi dei controlli, in un posto solo.
 *
 * Esistono per una ragione misurabile: **44 pixel**. E' la dimensione minima di
 * un bersaglio toccabile secondo le linee guida di iOS e Android, e i controlli
 * scritti guardando uno schermo grande finiscono naturalmente a venti — si
 * cliccano benissimo col mouse e si sbagliano col pollice.
 *
 * Da qui in giu' i controlli sono alti 44 px e larghi quanto la colonna; da
 * `sm` in su tornano compatti, perche' su una tastiera la densita' e' un
 * vantaggio e il bersaglio grande e' solo spazio sprecato.
 *
 * Stanno in un modulo condiviso e non copiati in ogni schermata perche' quattro
 * copie della stessa misura divergono alla prima modifica, e la schermata che
 * resta indietro e' sempre quella che si usa meno — cioe' quella che nessuno
 * prova.
 */

const BASE_CAMPO =
  'rounded-md border border-neutral-300 bg-white px-3 text-sm ' +
  'dark:border-neutral-700 dark:bg-neutral-900';

/** Campo a piena larghezza sul telefono, compatto da `sm` in su. */
export const CAMPO = `${BASE_CAMPO} min-h-11 w-full sm:min-h-9 sm:w-auto`;

/** Campo che resta a piena larghezza anche su schermo grande (dentro una griglia). */
export const CAMPO_PIENO = `${BASE_CAMPO} min-h-11 w-full sm:min-h-9`;

export const BOTTONE =
  'inline-flex min-h-11 items-center justify-center rounded-md bg-neutral-900 px-4 ' +
  'text-sm font-medium text-white disabled:opacity-40 ' +
  'dark:bg-white dark:text-neutral-900 sm:min-h-9';

/**
 * Bottone secondario. Alto 44 px come il principale finche' lo schermo e'
 * stretto: «secondario» descrive l'importanza visiva, non la precisione con
 * cui lo si preme — e i tre giudizi d'uso sono l'azione piu' frequente
 * dell'applicazione, non un ripiego.
 */
export const BOTTONE_MINORE =
  'inline-flex min-h-11 items-center justify-center rounded-md border border-neutral-300 ' +
  'px-3 text-xs disabled:opacity-40 sm:min-h-8 dark:border-neutral-700';

/**
 * Una casella di spunta piccola quanto il carattere si sbaglia sempre. Il
 * bersaglio vero e' l'etichetta che la contiene, che va resa alta almeno 44 px.
 */
export const CASELLA = 'size-4 shrink-0';
export const ETICHETTA_CASELLA =
  'inline-flex min-h-11 items-center gap-2 text-xs text-neutral-500 sm:min-h-0';
