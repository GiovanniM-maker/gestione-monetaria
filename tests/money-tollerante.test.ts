import { describe, expect, it } from 'vitest';
import { parseCentesimi, parseCentesimiTollerante } from '@/lib/money';

/**
 * Regressione di un guasto vero: la categorizzazione moriva con
 * «e.trim is not a function» perché PostgREST serializza `numeric` come
 * **numero JSON**, e l'importo arrivava float dove il codice attendeva una
 * stringa decimale.
 */

describe('parseCentesimiTollerante', () => {
  it('legge le stringhe decimali esattamente come la versione severa', () => {
    for (const valore of ['0.00', '-3640.32', '12670.32', '9.99', '-0.44']) {
      expect(parseCentesimiTollerante(valore)).toBe(parseCentesimi(valore));
    }
  });

  it('non muore sul numero JSON che PostgREST restituisce per numeric', () => {
    expect(() => parseCentesimiTollerante(-3640.32)).not.toThrow();
    expect(parseCentesimiTollerante(-3640.32)).toBeNull();
  });

  it('restituisce null, non zero, su cio che non sa leggere', () => {
    // La distinzione e' il punto della funzione: uno zero silenzioso in
    // un'app di spese e' un errore che sembra un dato.
    for (const valore of [null, undefined, {}, [], '', 'boh', '1.234']) {
      expect(parseCentesimiTollerante(valore)).toBeNull();
    }
    expect(parseCentesimiTollerante('0.00')).toBe(0n);
  });
});
