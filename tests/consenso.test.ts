import { describe, expect, it } from 'vitest';
import {
  CONSENSO_MASSIMO_SECONDI,
  CONSENSO_PREDEFINITO_SECONDI,
  MARGINE_SECONDI,
  scadenzaConsenso,
  secondiDiConsenso,
} from '@/lib/enablebanking/consenso';

const GIORNO = 24 * 60 * 60;

describe('secondiDiConsenso', () => {
  it('chiede i 180 giorni che Revolut dichiara, non i 90 di default', () => {
    // Il caso che motiva l'intera funzione: con il valore fisso precedente si
    // sarebbe chiesto la meta' del consenso disponibile, raddoppiando le SCA.
    expect(secondiDiConsenso(180 * GIORNO)).toBe(180 * GIORNO);
  });

  it('accetta anche la forma stringa, che e come arriva dal form', () => {
    expect(secondiDiConsenso(String(180 * GIORNO))).toBe(180 * GIORNO);
  });

  it('ripiega sul predefinito quando il connettore non dichiara niente', () => {
    for (const assente of [undefined, null, '', 'boh', Number.NaN, {}]) {
      expect(secondiDiConsenso(assente)).toBe(CONSENSO_PREDEFINITO_SECONDI);
    }
  });

  it('ripiega sul predefinito su valori troppo piccoli per essere veri', () => {
    expect(secondiDiConsenso(0)).toBe(CONSENSO_PREDEFINITO_SECONDI);
    expect(secondiDiConsenso(-1)).toBe(CONSENSO_PREDEFINITO_SECONDI);
    expect(secondiDiConsenso(3600)).toBe(CONSENSO_PREDEFINITO_SECONDI);
  });

  it('non supera mai il tetto, qualunque cosa dica la risposta', () => {
    expect(secondiDiConsenso(99 * 365 * GIORNO)).toBe(CONSENSO_MASSIMO_SECONDI);
  });
});

describe('scadenzaConsenso', () => {
  it('sottrae il margine, per non farsi rifiutare per un arrotondamento', () => {
    const adesso = new Date('2026-08-11T12:00:00.000Z');
    const scadenza = scadenzaConsenso(180 * GIORNO, adesso);

    expect(scadenza.getTime()).toBe(adesso.getTime() + (180 * GIORNO - MARGINE_SECONDI) * 1000);
    expect(scadenza.getTime()).toBeLessThan(adesso.getTime() + 180 * GIORNO * 1000);
  });
});
