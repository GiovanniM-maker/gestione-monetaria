import { parseCentesimiTollerante } from '@/lib/money';
import { formattaEuro } from '@/lib/abbonamenti/formato';
import type { Grafico, Serie } from './messaggi';

/**
 * La geometria di un grafico, senza disegnarlo.
 *
 * ---------------------------------------------------------------------------
 * Perché sta in un modulo puro
 * ---------------------------------------------------------------------------
 * È l'unico pezzo del grafico che possa sbagliare in modo silenzioso: un asse
 * scalato male produce una figura *plausibile* e falsa, ed è esattamente la
 * categoria di errore che il resto di questa applicazione combatte sui numeri.
 * Qui si può provare con degli assert, mentre un SVG scritto dentro un
 * componente si può solo guardare.
 *
 * ---------------------------------------------------------------------------
 * I valori restano in centesimi, i pixel no
 * ---------------------------------------------------------------------------
 * Ogni importo si legge con `parseCentesimiTollerante` e resta `bigint` fino
 * all'etichetta, che si formatta con `formattaEuro`. **Nessun importo mostrato
 * passa da un float.**
 *
 * Le coordinate sì, e va bene: un pixel è una posizione su uno schermo, non un
 * euro. La distinzione è la stessa che vale in tutta l'applicazione — la
 * formattazione avviene al bordo, e sotto c'è l'intero.
 *
 * ---------------------------------------------------------------------------
 * Lo zero sta sempre nel dominio
 * ---------------------------------------------------------------------------
 * Un grafico di spese che parte dal minimo osservato fa sembrare enorme una
 * variazione del 3%. È il modo più comune di mentire con un grafico vero, e
 * non richiede nemmeno cattiva fede: è il comportamento predefinito di quasi
 * tutte le librerie.
 *
 * Includere lo zero costa un po' di spazio verticale e restituisce
 * proporzioni leggibili come proporzioni.
 */

export type PuntoDisegnato = {
  x: number;
  y: number;
  etichetta: string;
  centesimi: bigint;
  /** Già formattato: chi disegna non deve toccare gli importi. */
  testo: string;
};

export type SerieDisegnata = {
  nome: string;
  /** Indice della serie, per scegliere un colore senza che questo file ne conosca. */
  indice: number;
  punti: readonly PuntoDisegnato[];
};

export type Disegno = {
  larghezza: number;
  altezza: number;
  serie: readonly SerieDisegnata[];
  /** Dove cade lo zero: è la linea rispetto a cui si legge tutto il resto. */
  zeroY: number;
  tacche: readonly { y: number; testo: string }[];
  etichetteX: readonly { x: number; testo: string }[];
  /** Importi che non si sono saputi leggere. Vanno detti, non ingoiati. */
  nonLetti: number;
};

/** Il sistema di coordinate del disegno. Il CSS lo scala, la forma non cambia. */
const LARGHEZZA = 320;
const ALTEZZA = 150;
const MARGINE = { su: 10, giu: 20, sinistra: 4, destra: 4 } as const;

type PuntoLetto = { etichetta: string; centesimi: bigint };

function leggi(serie: readonly Serie[]): {
  lette: { nome: string; punti: PuntoLetto[] }[];
  nonLetti: number;
} {
  let nonLetti = 0;
  const lette = serie.map((s) => ({
    nome: s.nome,
    punti: s.punti.flatMap((p) => {
      const centesimi = parseCentesimiTollerante(p.valore);
      if (centesimi === null) {
        nonLetti += 1;
        return [];
      }
      return [{ etichetta: p.etichetta, centesimi }];
    }),
  }));
  return { lette, nonLetti };
}

/**
 * `null` quando non c'è niente da disegnare.
 *
 * Un grafico con un punto solo non è un grafico: è un numero, e come numero si
 * legge meglio scritto. Chi chiama mostra il testo invece di una figura vuota.
 */
export function disegna(grafico: Grafico): Disegno | null {
  const { lette, nonLetti } = leggi(grafico.serie);
  const conPunti = lette.filter((s) => s.punti.length > 0);
  if (conPunti.length === 0) return null;

  const lunghezza = Math.max(...conPunti.map((s) => s.punti.length));
  if (lunghezza < 2) return null;

  const tutti = conPunti.flatMap((s) => s.punti.map((p) => p.centesimi));

  // Lo zero entra sempre nel dominio: senza, una variazione del 3% riempie
  // tutta l'altezza e si legge come un crollo.
  let minimo = tutti.reduce((a, b) => (b < a ? b : a), 0n);
  let massimo = tutti.reduce((a, b) => (b > a ? b : a), 0n);
  if (minimo === massimo) {
    // Serie tutta a zero: si apre una finestra qualsiasi, così la linea cade
    // sullo zero invece di dividere per zero.
    minimo = -100n;
    massimo = 100n;
  }

  const alto = ALTEZZA - MARGINE.su - MARGINE.giu;
  const largo = LARGHEZZA - MARGINE.sinistra - MARGINE.destra;
  const ampiezza = Number(massimo - minimo);

  const y = (centesimi: bigint): number =>
    MARGINE.su + alto - (Number(centesimi - minimo) / ampiezza) * alto;

  const x = (indice: number, quanti: number): number =>
    MARGINE.sinistra + (quanti === 1 ? largo / 2 : (indice / (quanti - 1)) * largo);

  const serie: SerieDisegnata[] = conPunti.map((s, indice) => ({
    nome: s.nome,
    indice,
    punti: s.punti.map((p, i) => ({
      x: x(i, s.punti.length),
      y: y(p.centesimi),
      etichetta: p.etichetta,
      centesimi: p.centesimi,
      testo: formattaEuro(p.centesimi),
    })),
  }));

  // Tre tacche e non di più: su 360 pixel una scala fitta si legge peggio di
  // nessuna scala. Lo zero c'è sempre perché è il riferimento.
  const tacche = [
    { y: y(massimo), testo: formattaEuro(massimo) },
    { y: y(0n), testo: formattaEuro(0n) },
    { y: y(minimo), testo: formattaEuro(minimo) },
  ].filter((t, i, tutte) => tutte.findIndex((u) => Math.abs(u.y - t.y) < 8) === i);

  // Prima, ultima e quella di mezzo. Dodici etichette su un telefono diventano
  // una riga grigia illeggibile, che è meno informativa di tre leggibili.
  const riferimento = conPunti[0]?.punti ?? [];
  const indici = [
    ...new Set([0, Math.floor((riferimento.length - 1) / 2), riferimento.length - 1]),
  ];
  const etichetteX = indici
    .filter((i) => i >= 0 && i < riferimento.length)
    .map((i) => ({ x: x(i, riferimento.length), testo: riferimento[i]?.etichetta ?? '' }));

  return {
    larghezza: LARGHEZZA,
    altezza: ALTEZZA,
    serie,
    zeroY: y(0n),
    tacche,
    etichetteX,
    nonLetti,
  };
}

/** Il tracciato di una spezzata, nella forma che vuole `<polyline>`. */
export function spezzata(punti: readonly PuntoDisegnato[]): string {
  return punti.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
}

/**
 * Larghezza di una barra, quando le barre sono `quante`.
 *
 * Sta qui e non nel componente perché dipende dalla stessa geometria delle
 * ascisse: calcolata a occhio nel JSX, si scollerebbe dalle posizioni al primo
 * cambio di margine.
 */
export function larghezzaBarra(quante: number): number {
  const largo = LARGHEZZA - MARGINE.sinistra - MARGINE.destra;
  return Math.max(2, (largo / Math.max(quante, 1)) * 0.6);
}

export { LARGHEZZA, ALTEZZA };
