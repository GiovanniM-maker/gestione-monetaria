import { describe, expect, it } from 'vitest';
import { daQuanto, freschezza } from '@/lib/cruscotto/freschezza';

const ORA = Date.parse('2026-08-16T16:00:00Z');
const oreFa = (n: number): string => new Date(ORA - n * 3_600_000).toISOString();

describe('freschezza dei dati', () => {
  it('una sincronizzazione di stanotte non e’ ferma', () => {
    const f = freschezza(oreFa(11), ORA);
    expect(f.ferma).toBe(false);
    expect(f.grave).toBe(false);
  });

  it('una notte saltata non fa ancora scattare niente', () => {
    // Si ripara da sola al giro dopo: la finestra e' di sette giorni apposta,
    // e un riquadro per un intoppo che si risolve insegna a ignorare i riquadri.
    const f = freschezza(oreFa(36), ORA);
    expect(f.ferma).toBe(false);
  });

  it('due notti saltate si', () => {
    const f = freschezza(oreFa(50), ORA);
    expect(f.ferma).toBe(true);
    expect(f.grave).toBe(false);
    expect(f.giorni).toBe(2);
  });

  it('cinque giorni sono gravi', () => {
    const f = freschezza(oreFa(121), ORA);
    expect(f.grave).toBe(true);
  });

  it('il caso vero del 16 agosto 2026', () => {
    // Ultima sincronizzazione riuscita: 13 agosto 16:24 UTC. Il cruscotto
    // mostrava «consenso valido ancora 175 giorni» in grigio.
    const f = freschezza('2026-08-13T16:24:01.427+00:00', ORA);
    expect(f.ferma).toBe(true);
    // Settantun ore e mezza: due giorni pieni, non tre. Si contano le ore
    // passate e non i fogli del calendario voltati — «tre giorni fa» per
    // qualcosa di settantun ore fa sarebbe un'esagerazione, e chi legge un
    // avviso deve poter credere anche al numero che ci sta dentro. La data
    // esatta sta accanto, per chi la vuole.
    expect(f.giorni).toBe(2);
    expect(daQuanto(f)).toBe('2 giorni fa');
  });

  it('mai sincronizzato e’ grave, non «zero ore fa»', () => {
    const f = freschezza(null, ORA);
    expect(f.ore).toBeNull();
    expect(f.grave).toBe(true);
    expect(daQuanto(f)).toBe('mai');
  });

  it('una data illeggibile fallisce chiusa', () => {
    // L'errore da evitare e' dire «tutto a posto» quando non si sa.
    expect(freschezza('domani', ORA).grave).toBe(true);
  });

  it('un istante nel futuro non diventa un tempo negativo', () => {
    // L'orologio del database e quello di chi guarda non sono lo stesso.
    const f = freschezza(oreFa(-2), ORA);
    expect(f.ore).toBe(0);
    expect(f.ferma).toBe(false);
  });

  it('lo dice come lo direbbe una persona', () => {
    expect(daQuanto(freschezza(oreFa(0.5), ORA))).toBe('meno di un’ora fa');
    expect(daQuanto(freschezza(oreFa(5), ORA))).toBe('5 ore fa');
    expect(daQuanto(freschezza(oreFa(30), ORA))).toBe('ieri');
  });
});
