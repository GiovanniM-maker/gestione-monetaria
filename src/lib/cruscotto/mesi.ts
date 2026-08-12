/**
 * Le funzioni pure del cruscotto: mesi civili e proporzioni.
 *
 * Il mese si manipola come **testo `YYYY-MM`**, mai come `Date`.
 *
 * Non e' un vezzo. `new Date('2026-07-01')` e' mezzanotte UTC, e in
 * `Europe/Rome` d'estate sono le 02:00 del primo: sottrarre un mese con
 * `setMonth` e poi rileggere il risultato in ora locale riporta al 30 giugno o
 * al 1 luglio a seconda del fuso e dell'ora legale. E' la stessa conversione
 * che CLAUDE.md vieta su `booking_date`, per la stessa ragione: sposta i
 * movimenti di confine nel mese sbagliato.
 *
 * Con anno e mese come interi la domanda «qual e' il mese prima di luglio 2026»
 * ha una sola risposta, e nessun fuso puo' cambiarla.
 */

const MESE = /^(\d{4})-(0[1-9]|1[0-2])$/;

const NOMI = [
  'gennaio',
  'febbraio',
  'marzo',
  'aprile',
  'maggio',
  'giugno',
  'luglio',
  'agosto',
  'settembre',
  'ottobre',
  'novembre',
  'dicembre',
];

/** `null` se non e' un mese: chi chiama decide cosa fare, invece di ricevere NaN. */
export function meseValido(valore: unknown): string | null {
  if (typeof valore !== 'string') return null;
  return MESE.test(valore.trim()) ? valore.trim() : null;
}

/**
 * Da `2026-07-01` (come arriva da Postgres) a `2026-07`.
 *
 * Taglia la stringa invece di parsarla: la data e' gia' un giorno civile, e
 * farla passare da un `Date` sarebbe l'unico modo di sbagliarla.
 */
export function meseDaData(valore: unknown): string | null {
  if (typeof valore !== 'string') return null;
  return meseValido(valore.slice(0, 7));
}

function pezzi(mese: string): { anno: number; numero: number } | null {
  const trovato = MESE.exec(mese.trim());
  if (trovato === null) return null;
  return { anno: Number(trovato[1]), numero: Number(trovato[2]) };
}

export function spostaMese(mese: string, delta: number): string | null {
  const p = pezzi(mese);
  if (p === null) return null;

  // Indice a base zero da un'origine fissa: cosi' lo spostamento e' una somma
  // e non una serie di casi sul dodicesimo mese.
  const indice = p.anno * 12 + (p.numero - 1) + delta;
  if (indice < 0) return null;

  const anno = Math.floor(indice / 12);
  const numero = (indice % 12) + 1;
  return `${String(anno).padStart(4, '0')}-${String(numero).padStart(2, '0')}`;
}

export function etichettaMese(mese: string): string {
  const p = pezzi(mese);
  if (p === null) return mese;
  return `${NOMI[p.numero - 1]} ${p.anno}`;
}

/** Forma breve per le barre dell'andamento: `lug 26`. */
export function etichettaBreve(mese: string): string {
  const p = pezzi(mese);
  if (p === null) return mese;
  return `${NOMI[p.numero - 1]?.slice(0, 3)} ${String(p.anno).slice(2)}`;
}

/**
 * Quota percentuale, per la larghezza di una barra.
 *
 * Qui il `number` e' ammesso, ed e' l'unico posto: il risultato non e' un
 * importo, e' una lunghezza in pixel. La regola vieta l'aritmetica su float
 * **sul denaro**, perche' un centesimo perso diventa un totale sbagliato — una
 * barra larga il 43,7% invece del 43,68% non e' un errore, e' un pixel.
 *
 * Il segno sparisce di proposito: le uscite sono negative, e una barra lunga
 * meno di zero non esiste.
 */
export function quotaPercentuale(parte: bigint, totale: bigint): number {
  const t = totale < 0n ? -totale : totale;
  if (t === 0n) return 0;
  const p = parte < 0n ? -parte : parte;
  const millesimi = Number((p * 1000n) / t);
  return Math.min(100, millesimi / 10);
}

/**
 * Variazione percentuale fra due mesi, in modulo.
 *
 * `null` quando il mese precedente e' a zero: non esiste una variazione
 * rispetto al niente, e mostrare «+100%» o «+Inf%» sarebbe inventare
 * un'informazione. Positivo = si e' speso di piu'.
 */
export function variazione(attuale: bigint, precedente: bigint): number | null {
  const p = precedente < 0n ? -precedente : precedente;
  if (p === 0n) return null;
  const a = attuale < 0n ? -attuale : attuale;
  return Number(((a - p) * 1000n) / p) / 10;
}
