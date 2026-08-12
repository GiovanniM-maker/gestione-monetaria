import { describe, expect, it } from 'vitest';
import {
  confronta,
  giornoDelMese,
  leggiPeriodi,
  medianaScelta,
} from '@/lib/cruscotto/confronto';

describe('medianaScelta — sceglie un valore osservato, non ne inventa uno', () => {
  it('su un numero dispari e’ il centrale', () => {
    expect(medianaScelta([-100n, -300n, -200n])).toBe(-200n);
  });

  it('su un numero pari prende il piu’ basso dei due centrali, non la media', () => {
    // La media di -100 e -200 sarebbe -150, che non e' mai stato speso in
    // nessun mese. Come termine di paragone serve un numero vero.
    expect(medianaScelta([-100n, -200n, -300n, -400n])).toBe(-300n);
  });

  it('su un valore solo e’ quel valore, su nessuno e’ null', () => {
    expect(medianaScelta([-42n])).toBe(-42n);
    expect(medianaScelta([])).toBeNull();
  });
});

describe('leggiPeriodi', () => {
  it('converte data e importo', () => {
    const p = leggiPeriodi([{ mese: '2026-07-01', spesa: '-530.00', movimenti: 3 }]);
    expect(p).toEqual([{ mese: '2026-07', spesa: -53000n, movimenti: 3 }]);
  });

  it('scarta una riga illeggibile invece di contarla zero', () => {
    // Uno zero silenzioso sposterebbe la mediana senza che si veda.
    const p = leggiPeriodi([
      { mese: '2026-07-01', spesa: '-530.00', movimenti: 3 },
      { mese: '2026-06-01', spesa: null, movimenti: 1 },
      { mese: 'boh', spesa: '-10.00', movimenti: 1 },
    ]);
    expect(p).toHaveLength(1);
  });
});

describe('confronta — undici giorni contro undici giorni', () => {
  const periodi = leggiPeriodi([
    { mese: '2026-08-01', spesa: '-996.14', movimenti: 53 },
    { mese: '2026-07-01', spesa: '-1240.00', movimenti: 48 },
    { mese: '2026-06-01', spesa: '-890.00', movimenti: 40 },
    { mese: '2026-05-01', spesa: '-1510.00', movimenti: 55 },
  ]);

  it('confronta con un mese realmente osservato', () => {
    const c = confronta('2026-08', periodi);
    expect(c?.corrente.spesa).toBe(-99614n);
    expect(c?.precedenti.map((p) => p.mese)).toEqual(['2026-07', '2026-06', '2026-05']);
    // Mediana di -1240, -890, -1510 → -1240, che e' luglio.
    expect(c?.riferimento).toBe(-124000n);
  });

  it('lo scostamento e’ negativo quando si sta spendendo meno', () => {
    const c = confronta('2026-08', periodi);
    expect(c?.scostamento).toBeCloseTo(-19.6, 1);
  });

  it('senza mesi precedenti non c’e’ un riferimento, e non se ne inventa uno', () => {
    const c = confronta('2026-08', leggiPeriodi([
      { mese: '2026-08-01', spesa: '-996.14', movimenti: 53 },
    ]));
    expect(c?.riferimento).toBeNull();
    expect(c?.scostamento).toBeNull();
  });

  it('su un mese che non c’e’ risponde null', () => {
    expect(confronta('2026-01', periodi)).toBeNull();
  });
});

describe('giornoDelMese', () => {
  it('legge il giorno senza passare da un Date', () => {
    expect(giornoDelMese('2026-08-11')).toBe(11);
    expect(giornoDelMese('2026-08-01')).toBe(1);
    expect(giornoDelMese('2026-08-31')).toBe(31);
  });

  it('su niente o su qualcosa che non e’ una data risponde null', () => {
    expect(giornoDelMese(null)).toBeNull();
    expect(giornoDelMese('ieri')).toBeNull();
  });
});
