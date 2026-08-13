import { describe, expect, it } from 'vitest';
import { archi, conResto, fette, GIRO, larghezza } from '@/lib/ui/fette';

/**
 * La geometria della barra segmentata e della ciambella.
 *
 * Il difetto che questi test esistono per prendere non e' una fetta sbagliata
 * di poco: e' la **somma** che non fa un giro intero. Su una ciambella si vede
 * come uno spicchio di fondo che nessuno ha ordinato, e su una barra come una
 * riga che non arriva in fondo — in entrambi i casi la figura dice che manca
 * qualcosa quando non manca niente.
 */

function voci(...valori: bigint[]) {
  return valori.map((valore, i) => ({ chiave: `v${i}`, valore }));
}

describe('fette', () => {
  it('divide in proporzione e chiude sempre il giro', () => {
    const f = fette(voci(-5000n, -3000n, -2000n));
    expect(f.map((x) => x.lunghezza)).toEqual([500, 300, 200]);
    expect(f.map((x) => x.inizio)).toEqual([0, 500, 800]);
    expect(f[f.length - 1]!.inizio + f[f.length - 1]!.lunghezza).toBe(GIRO);
  });

  it('non lascia buchi quando la divisione non e" esatta', () => {
    // Tre terzi: arrotondando ogni fetta per conto suo si otterrebbe
    // 333+333+333 = 999, e l'ultimo millesimo resterebbe scoperto.
    const f = fette(voci(-100n, -100n, -100n));
    expect(f.map((x) => x.lunghezza)).toEqual([333, 333, 334]);
    expect(f.reduce((s, x) => s + x.lunghezza, 0)).toBe(GIRO);
  });

  it('chiude il giro anche su molte fette minuscole', () => {
    const f = fette(voci(...Array.from({ length: 37 }, () => -7n)));
    expect(f.reduce((s, x) => s + x.lunghezza, 0)).toBe(GIRO);
    // Ogni fetta comincia dove finisce la precedente: nessuna sovrapposizione,
    // nessun buco.
    for (let i = 1; i < f.length; i += 1) {
      expect(f[i]!.inizio).toBe(f[i - 1]!.inizio + f[i - 1]!.lunghezza);
    }
  });

  it('ignora il segno: le uscite sono negative e una fetta negativa non esiste', () => {
    expect(fette(voci(-1n, 1n)).map((x) => x.lunghezza)).toEqual([500, 500]);
  });

  it('a totale zero non disegna niente, invece di dividere per zero', () => {
    const f = fette(voci(0n, 0n));
    expect(f.map((x) => x.lunghezza)).toEqual([0, 0]);
  });

  it('una voce a zero non sposta le altre', () => {
    const f = fette(voci(-100n, 0n, -100n));
    expect(f.map((x) => x.lunghezza)).toEqual([500, 0, 500]);
    expect(f[2]!.inizio).toBe(500);
  });

  it('conserva l ordine ricevuto, che e" quello che rende la barra riconoscibile', () => {
    const f = fette([
      { chiave: 'essenziale', valore: -100n },
      { chiave: 'voluttuario', valore: -900n },
    ]);
    expect(f.map((x) => x.chiave)).toEqual(['essenziale', 'voluttuario']);
  });
});

describe('archi', () => {
  it('i tratti sommano alla circonferenza', () => {
    const raggio = 48;
    const circonferenza = 2 * Math.PI * raggio;
    const a = archi(fette(voci(-5000n, -3000n, -2000n)), raggio);
    expect(a.reduce((s, x) => s + x.tratto, 0)).toBeCloseTo(circonferenza, 9);
  });

  it('lo scostamento e" negativo, o la fetta parte dalla parte sbagliata', () => {
    const a = archi(fette(voci(-1n, -1n)), 10);
    expect(a[0]!.scostamento).toBe(-0);
    expect(a[1]!.scostamento).toBeLessThan(0);
  });

  it('una fetta sola copre tutto il cerchio e non lascia vuoto', () => {
    const a = archi(fette(voci(-42n)), 10);
    expect(a[0]!.vuoto).toBe(0);
    expect(a[0]!.tratto).toBeCloseTo(2 * Math.PI * 10, 9);
  });
});

describe('conResto', () => {
  it('non perde un centesimo: il resto vale la somma di chi e" stato tolto', () => {
    const { teste, resto } = conResto(voci(-500n, -300n, -100n, -60n, -40n), 2);
    expect(teste.map((t) => t.valore)).toEqual([-500n, -300n]);
    expect(resto).toEqual({ voci: 3, valore: -200n });
    // La somma dopo il taglio e" identica a quella prima: la ciambella chiude.
    expect(teste.reduce((s, t) => s + t.valore, 0n) + (resto?.valore ?? 0n)).toBe(-1000n);
  });

  it('non taglia per togliere una voce sola', () => {
    const { teste, resto } = conResto(voci(-3n, -2n, -1n), 2);
    expect(teste).toHaveLength(3);
    expect(resto).toBeNull();
  });

  it('non taglia quando non c e" niente da tagliare', () => {
    expect(conResto(voci(-1n), 7).resto).toBeNull();
    expect(conResto([], 7).teste).toEqual([]);
  });
});

describe('larghezza', () => {
  it('traduce i millesimi in percentuale CSS', () => {
    expect(larghezza({ chiave: 'x', valore: -1n, inizio: 0, lunghezza: 333 })).toBe('33.3%');
    expect(larghezza({ chiave: 'x', valore: -1n, inizio: 0, lunghezza: 1000 })).toBe('100%');
  });
});
