import { describe, expect, it } from 'vitest';
import { gruppoDi, raggruppaPerTempo } from '@/lib/conferma/gruppi';

/**
 * `booking_date` e' un giorno civile, senza ora e senza fuso. Tutta
 * l'aritmetica qui sotto deve restare fra giorni: e' il punto in cui questo
 * progetto si e' gia' bruciato, col movimento delle 00:11 finito nel mese
 * prima.
 */

const OGGI = '2026-08-16';

describe('gruppoDi — i confini dei quattro gruppi', () => {
  it('oggi, ieri, la settimana e il resto', () => {
    expect(gruppoDi('2026-08-16', OGGI)).toBe('oggi');
    expect(gruppoDi('2026-08-15', OGGI)).toBe('ieri');
    expect(gruppoDi('2026-08-14', OGGI)).toBe('settimana');
    expect(gruppoDi('2026-08-10', OGGI)).toBe('settimana');
    expect(gruppoDi('2026-08-09', OGGI)).toBe('prima');
  });

  it('il settimo giorno esatto e’ gia’ «prima»', () => {
    // Sette giorni fa non e' «negli ultimi sette giorni»: e' il confine, e un
    // confine descritto a parole va provato invece che riletto.
    expect(gruppoDi('2026-08-09', '2026-08-16')).toBe('prima');
    expect(gruppoDi('2026-08-10', '2026-08-16')).toBe('settimana');
  });

  it('attraversa il cambio di mese senza saltare un giorno', () => {
    expect(gruppoDi('2026-07-31', '2026-08-01')).toBe('ieri');
    expect(gruppoDi('2026-08-01', '2026-08-01')).toBe('oggi');
  });

  it('attraversa il cambio d’anno', () => {
    expect(gruppoDi('2025-12-31', '2026-01-01')).toBe('ieri');
  });

  it('attraversa il cambio dell’ora legale senza spostare niente', () => {
    // In Europa l'ora legale finisce l'ultima domenica di ottobre: quel giorno
    // dura venticinque ore. Sottraendo millisecondi e dividendo per 86.400.000
    // il 25 ottobre finirebbe nel gruppo sbagliato.
    expect(gruppoDi('2026-10-25', '2026-10-26')).toBe('ieri');
    expect(gruppoDi('2026-03-29', '2026-03-30')).toBe('ieri');
  });

  it('una data futura sta in «oggi» invece di sparire', () => {
    expect(gruppoDi('2026-08-20', OGGI)).toBe('oggi');
  });

  it('una data illeggibile finisce nel gruppo piu’ vecchio, non nel nulla', () => {
    // E' sbagliata, ma i soldi che rappresenta sono veri.
    expect(gruppoDi('mai', OGGI)).toBe('prima');
    expect(gruppoDi('', OGGI)).toBe('prima');
  });
});

type R = { booking_date: string; amount_eur: string | null };
const importo = (r: R) => r.amount_eur;

const RIGHE: R[] = [
  { booking_date: '2026-08-16', amount_eur: '-10.00' },
  { booking_date: '2026-08-16', amount_eur: '-90.00' },
  { booking_date: '2026-08-15', amount_eur: '-50.00' },
  { booking_date: '2026-08-01', amount_eur: '-5.00' },
];

describe('raggruppaPerTempo', () => {
  it('non perde nessuna riga', () => {
    // La cosa che conta piu' di tutte: una riga che sparisce da questa
    // schermata e' una spesa che nessuno guardera' mai piu'.
    const g = raggruppaPerTempo(RIGHE, OGGI, 'data', importo);
    expect(g.flatMap((x) => x.righe)).toHaveLength(RIGHE.length);
  });

  it('non mostra i gruppi vuoti', () => {
    const g = raggruppaPerTempo(RIGHE, OGGI, 'data', importo);
    expect(g.map((x) => x.chiave)).toEqual(['oggi', 'ieri', 'prima']);
  });

  it('i gruppi restano in ordine di tempo anche ordinando per importo', () => {
    // Il tempo e' la struttura della schermata, l'importo e' l'ordine dentro.
    // Se cambiando ordinamento si rimescolassero anche i gruppi, la schermata
    // cambierebbe forma e non si ritroverebbe piu' niente.
    const g = raggruppaPerTempo(RIGHE, OGGI, 'importo', importo);
    expect(g.map((x) => x.chiave)).toEqual(['oggi', 'ieri', 'prima']);
  });

  it('per data mette il piu’ recente in cima', () => {
    const g = raggruppaPerTempo(
      [
        { booking_date: '2026-08-14', amount_eur: '-1.00' },
        { booking_date: '2026-08-13', amount_eur: '-99.00' },
      ],
      OGGI,
      'data',
      importo,
    );
    expect(g[0]?.righe.map((r) => r.booking_date)).toEqual(['2026-08-14', '2026-08-13']);
  });

  it('per importo mette il piu’ grosso in cima, dentro il suo gruppo', () => {
    const g = raggruppaPerTempo(RIGHE, OGGI, 'importo', importo);
    expect(g[0]?.righe.map((r) => r.amount_eur)).toEqual(['-90.00', '-10.00']);
  });

  it('per importo ordina sul modulo, o le entrate finirebbero in cima', () => {
    const g = raggruppaPerTempo(
      [
        { booking_date: '2026-08-16', amount_eur: '-80.00' },
        { booking_date: '2026-08-16', amount_eur: '20.00' },
      ],
      OGGI,
      'importo',
      importo,
    );
    expect(g[0]?.righe[0]?.amount_eur).toBe('-80.00');
  });

  it('a parita’ di importo torna alla data, invece di un ordine a caso', () => {
    // Due spese uguali in ordine casuale cambierebbero posto a ogni ridisegno.
    const g = raggruppaPerTempo(
      [
        { booking_date: '2026-08-12', amount_eur: '-7.00' },
        { booking_date: '2026-08-14', amount_eur: '-7.00' },
      ],
      OGGI,
      'importo',
      importo,
    );
    expect(g[0]?.righe.map((r) => r.booking_date)).toEqual(['2026-08-14', '2026-08-12']);
  });

  it('una riga senza importo in euro vale zero e non rompe l’ordinamento', () => {
    const g = raggruppaPerTempo(
      [
        { booking_date: '2026-08-16', amount_eur: null },
        { booking_date: '2026-08-16', amount_eur: '-3.00' },
      ],
      OGGI,
      'importo',
      importo,
    );
    expect(g[0]?.righe).toHaveLength(2);
    expect(g[0]?.righe[0]?.amount_eur).toBe('-3.00');
  });
});
