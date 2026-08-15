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

/**
 * ---------------------------------------------------------------------------
 * Superfici, non bordi
 * ---------------------------------------------------------------------------
 * Un campo era un rettangolo bianco con un filo grigio intorno. Dieci fili su
 * una schermata la fanno sembrare un modulo da compilare, e al buio sono dieci
 * linee che competono col contenuto. Ora un campo e' una **superficie piu'
 * profonda** di cio' su cui poggia: si riconosce che ci si puo' scrivere dentro
 * senza che nulla debba essere disegnato intorno.
 *
 * Le tinte non stanno qui: stanno in `globals.css`, in un posto solo.
 */
const BASE_CAMPO =
  'rounded-controllo bg-s3 px-3.5 text-[15px] text-testo placeholder:text-testo-3 ' +
  'outline-none focus:ring-2 focus:ring-(--essenziale)';

/** Campo a piena larghezza sul telefono, compatto da `sm` in su. */
export const CAMPO = `${BASE_CAMPO} min-h-11 w-full sm:min-h-10 sm:w-auto`;

/** Campo che resta a piena larghezza anche su schermo grande (dentro una griglia). */
export const CAMPO_PIENO = `${BASE_CAMPO} min-h-11 w-full sm:min-h-10`;

/**
 * Il bottone principale: pieno, invertito rispetto al fondo.
 *
 * Nero su chiaro e chiaro su nero, non blu: il blu e' gia' la tinta della
 * classe `essenziale` e dei collegamenti, e un terzo mestiere per lo stesso
 * colore lo renderebbe un'informazione in meno.
 */
export const BOTTONE =
  'inline-flex min-h-11 items-center justify-center rounded-controllo bg-testo px-4 ' +
  'text-[15px] font-semibold text-s1 disabled:opacity-40 sm:min-h-10';

/**
 * Bottone secondario. Alto 44 px come il principale finche' lo schermo e'
 * stretto: «secondario» descrive l'importanza visiva, non la precisione con
 * cui lo si preme — e i tre giudizi d'uso sono l'azione piu' frequente
 * dell'applicazione, non un ripiego.
 */
export const BOTTONE_MINORE =
  'inline-flex min-h-11 items-center justify-center rounded-controllo bg-s3 ' +
  'px-3.5 text-[13px] font-medium text-testo disabled:opacity-40 sm:min-h-9';

/**
 * Una casella di spunta piccola quanto il carattere si sbaglia sempre. Il
 * bersaglio vero e' l'etichetta che la contiene, che va resa alta almeno 44 px.
 */
export const CASELLA = 'size-4 shrink-0 accent-(--essenziale)';
export const ETICHETTA_CASELLA =
  'inline-flex min-h-11 items-center gap-2 text-[13px] text-testo-2 sm:min-h-0';
