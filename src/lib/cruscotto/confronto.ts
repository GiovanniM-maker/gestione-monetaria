/**
 * Il confronto fra un mese in corso e i mesi precedenti.
 *
 * Puro e testabile. La regola che governa questo file: **si misura, non si
 * proietta.** Un mese di undici giorni non si confronta con un mese di
 * trentuno, e non si estrapola a fine mese — si confronta con gli stessi
 * undici giorni dei mesi precedenti, che e' un'osservazione e non un'ipotesi.
 *
 * E' la stessa lezione della Fase 5, dove estrapolare da un intervallo mediano
 * dichiarava 8.966 €/mese di spesa che non esisteva.
 */

import { parseCentesimiTollerante } from '@/lib/money';
import { meseDaData } from './mesi';

export type RigaPeriodo = {
  mese: string;
  spesa: string | null;
  movimenti: number;
};

export type Periodo = {
  mese: string;
  spesa: bigint;
  movimenti: number;
};

export function leggiPeriodi(righe: readonly RigaPeriodo[]): readonly Periodo[] {
  return righe.flatMap((r) => {
    const mese = meseDaData(r.mese);
    const spesa = parseCentesimiTollerante(r.spesa);
    // Una riga illeggibile si scarta invece di contarla zero: uno zero
    // silenzioso in un confronto sposta la mediana e non si vede.
    return mese === null || spesa === null ? [] : [{ mese, spesa, movimenti: r.movimenti }];
  });
}

/**
 * La mediana **scelta**, mai calcolata.
 *
 * Su un numero pari di valori restituisce il piu' basso dei due centrali
 * invece della loro media. Non e' pigrizia: la media di due importi puo'
 * produrre mezzo centesimo, e soprattutto il risultato sarebbe un numero che
 * non e' mai stato speso in nessun mese. Qui serve un termine di paragone
 * reale — «negli altri mesi, a questo punto, avevo speso questo» — e un valore
 * osservato lo e', una media no.
 *
 * E' anche cio' che fa `percentile_disc` in SQL, per la stessa ragione.
 */
export function medianaScelta(valori: readonly bigint[]): bigint | null {
  if (valori.length === 0) return null;
  const ordinati = [...valori].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const centro = Math.floor((ordinati.length - 1) / 2);
  return ordinati[centro] ?? null;
}

export type Confronto = {
  /** Il mese in corso, sui giorni coperti. */
  corrente: Periodo;
  /** Gli stessi giorni dei mesi precedenti, dal piu' recente. */
  precedenti: readonly Periodo[];
  /** Il termine di paragone: un valore realmente osservato. */
  riferimento: bigint | null;
  /** Scostamento percentuale dal riferimento. Positivo = si sta spendendo di piu'. */
  scostamento: number | null;
};

export function confronta(mese: string, periodi: readonly Periodo[]): Confronto | null {
  const corrente = periodi.find((p) => p.mese === mese);
  if (corrente === undefined) return null;

  const precedenti = periodi.filter((p) => p.mese < mese);
  const riferimento = medianaScelta(precedenti.map((p) => p.spesa));

  return {
    corrente,
    precedenti,
    riferimento,
    scostamento: riferimento === null ? null : variazione(corrente.spesa, riferimento),
  };
}

function variazione(attuale: bigint, riferimento: bigint): number | null {
  const r = riferimento < 0n ? -riferimento : riferimento;
  if (r === 0n) return null;
  const a = attuale < 0n ? -attuale : attuale;
  return Number(((a - r) * 1000n) / r) / 10;
}

/** Il giorno del mese di una data `YYYY-MM-DD`. Nessun fuso, come sempre. */
export function giornoDelMese(data: string | null): number | null {
  if (data === null) return null;
  const trovato = /^\d{4}-\d{2}-(\d{2})$/.exec(data.trim());
  if (trovato === null) return null;
  const giorno = Number(trovato[1]);
  return giorno >= 1 && giorno <= 31 ? giorno : null;
}
