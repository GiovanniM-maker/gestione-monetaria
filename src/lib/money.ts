/**
 * Aritmetica monetaria.
 *
 * Regola non negoziabile di CLAUDE.md: mai float. Il tipo interno è l'intero in
 * centesimi (`bigint`), ottenuto parsando la stringa decimale che arriva da
 * Postgres o dall'API — **mai** `parseFloat`, che su `0.1 + 0.2` sbaglia già.
 *
 * La formattazione avviene solo al bordo UI. Qui dentro non si formatta niente.
 */

const DECIMALE = /^(-)?(\d+)(?:[.,](\d{1,2}))?$/;

/**
 * Da stringa decimale a centesimi.
 *
 * Rifiuta più di due decimali invece di arrotondare: un importo con tre cifre
 * dopo la virgola significa che stiamo leggendo qualcosa che non è un importo,
 * e arrotondare in silenzio nasconderebbe l'errore invece di segnalarlo.
 */
export function parseCentesimi(valore: string): bigint {
  const trovato = DECIMALE.exec(valore.trim());
  if (trovato === null) {
    throw new Error(`Importo non valido: ${JSON.stringify(valore)}`);
  }

  const segno = trovato[1] === '-' ? -1n : 1n;
  const interi = BigInt(trovato[2] ?? '0');
  const decimali = (trovato[3] ?? '').padEnd(2, '0');

  return segno * (interi * 100n + BigInt(decimali));
}

/** Da centesimi a stringa decimale, la forma che Postgres accetta per `numeric`. */
export function formattaCentesimi(centesimi: bigint): string {
  const negativo = centesimi < 0n;
  const assoluto = negativo ? -centesimi : centesimi;
  const interi = assoluto / 100n;
  const resto = assoluto % 100n;
  return `${negativo ? '-' : ''}${interi}.${resto.toString().padStart(2, '0')}`;
}

/** Numero di decimali con cui rappresentiamo un tasso di cambio. */
const DECIMALI_TASSO = 8;
const SCALA_TASSO = 10n ** BigInt(DECIMALI_TASSO);

function tassoScalato(tasso: string): bigint {
  const trovato = /^(-)?(\d+)(?:[.,](\d+))?$/.exec(tasso.trim());
  if (trovato === null || trovato[1] === '-') {
    throw new Error(`Tasso di cambio non valido: ${JSON.stringify(tasso)}`);
  }
  const interi = BigInt(trovato[2] ?? '0');
  const decimali = (trovato[3] ?? '').slice(0, DECIMALI_TASSO).padEnd(DECIMALI_TASSO, '0');
  return interi * SCALA_TASSO + BigInt(decimali);
}

/**
 * Divisione intera con arrotondamento **half away from zero**.
 *
 * È la regola fissata in CLAUDE.md, e non è la stessa cosa dell'arrotondamento
 * bancario né di quello di JavaScript: `Math.round(-0.5)` dà `-0`, mentre qui
 * -0.5 centesimi diventa -1. La differenza conta perché gli importi negativi
 * sono la maggioranza dei nostri dati, essendo le uscite.
 */
export function dividiArrotondando(numeratore: bigint, denominatore: bigint): bigint {
  if (denominatore === 0n) throw new Error('Divisione per zero');

  const negativo = numeratore < 0n !== denominatore < 0n;
  const a = numeratore < 0n ? -numeratore : numeratore;
  const b = denominatore < 0n ? -denominatore : denominatore;

  const quoziente = a / b;
  const resto = a % b;
  const arrotondato = resto * 2n >= b ? quoziente + 1n : quoziente;

  return negativo ? -arrotondato : arrotondato;
}

/**
 * Converte un importo applicando un tasso di cambio.
 *
 * La conversione si esegue **una volta sola, in ingestion**, e il risultato si
 * salva: ricalcolarla a runtime significherebbe che due schermate che
 * arrotondano in momenti diversi mostrano due numeri diversi per lo stesso
 * movimento.
 */
export function converti(centesimi: bigint, tasso: string): bigint {
  return dividiArrotondando(centesimi * tassoScalato(tasso), SCALA_TASSO);
}
