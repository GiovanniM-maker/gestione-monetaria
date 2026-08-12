/**
 * Le poche funzioni pure della Fase 5: somma di importi e formattazione.
 *
 * Sta in un modulo separato dal resto perche' e' l'unica parte verificabile
 * senza un database, ed e' anche quella che sbagliata non si vede: un totale
 * calcolato in float e' giusto in quasi tutti i casi, ed e' proprio per questo
 * che il caso in cui sbaglia arriva senza avvisare.
 *
 * Regola di CLAUDE.md: mai aritmetica su float. Qui dentro gli importi sono
 * interi di centesimi, e diventano stringhe solo all'ultima riga.
 */

import { parseCentesimiTollerante } from '@/lib/money';

export type Somma = {
  totale: bigint;
  /**
   * Quanti valori non si sono saputi leggere. Va riportato, non ingoiato: un
   * totale a cui mancano tre righe senza dirlo e' peggio di nessun totale.
   */
  nonLetti: number;
};

/** Somma importi che arrivano dal database come stringhe decimali. */
export function sommaCosti(valori: readonly unknown[]): Somma {
  let totale = 0n;
  let nonLetti = 0;

  for (const valore of valori) {
    const centesimi = parseCentesimiTollerante(valore);
    if (centesimi === null) nonLetti += 1;
    else totale += centesimi;
  }

  return { totale, nonLetti };
}

/**
 * Da centesimi a `1.234,56 €`.
 *
 * Costruita a mano dalla rappresentazione intera e non con
 * `Intl.NumberFormat`: quello vuole un `number`, e passargli un importo grande
 * significa farlo transitare da un float proprio nell'ultimo passaggio, dopo
 * che tutta la catena l'ha evitato.
 */
export function formattaEuro(centesimi: bigint): string {
  const negativo = centesimi < 0n;
  const assoluto = negativo ? -centesimi : centesimi;

  const interi = (assoluto / 100n).toString();
  const decimali = (assoluto % 100n).toString().padStart(2, '0');

  const raggruppati = interi.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  return `${negativo ? '−' : ''}${raggruppati},${decimali} €`;
}

/**
 * Giorni civili fra due date `YYYY-MM-DD`.
 *
 * Nessuna conversione di fuso, come impone CLAUDE.md per `booking_date`: le
 * due date si leggono come giorni interi e si sottraggono. `new Date(stringa)`
 * su un formato solo-data e' gia' interpretato come UTC da entrambe le parti,
 * quindi la differenza e' esatta — ma la si calcola comunque dai componenti,
 * per non dipendere da quel dettaglio.
 */
export function giorniDaOggi(data: string, oggi: string): number | null {
  const a = giorno(data);
  const b = giorno(oggi);
  if (a === null || b === null) return null;
  return Math.round((a - b) / 86_400_000);
}

function giorno(valore: string): number | null {
  const trovato = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valore.trim());
  if (trovato === null) return null;
  return Date.UTC(Number(trovato[1]), Number(trovato[2]) - 1, Number(trovato[3]));
}

/**
 * La frase che l'applicazione esiste per produrre.
 *
 * «Voluttuario ricorrente: 187 €/mese». Riceve righe gia' aggregate da SQL: qui
 * non si calcola nessun numero nuovo, si sceglie solo quale mostrare per primo
 * — quello che pesa di piu'.
 */
export type RigaMetrica = {
  discrezionalita: string;
  contesto: string;
  abbonamenti: number;
  costo_mensile: string | null;
};

export type VoceMetrica = {
  discrezionalita: string;
  contesto: string;
  abbonamenti: number;
  costoMensile: bigint;
};

export function ordinaPerPeso(righe: readonly RigaMetrica[]): readonly VoceMetrica[] {
  return righe
    .map((r) => ({
      discrezionalita: r.discrezionalita,
      contesto: r.contesto,
      abbonamenti: r.abbonamenti,
      costoMensile: parseCentesimiTollerante(r.costo_mensile) ?? 0n,
    }))
    // Le uscite sono negative: la voce piu' pesante e' la piu' piccola.
    .sort((a, b) => (a.costoMensile < b.costoMensile ? -1 : a.costoMensile > b.costoMensile ? 1 : 0));
}
