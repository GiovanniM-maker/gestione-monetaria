import { describe, expect, it } from 'vitest';
import { trasformaPannello, type Verso } from '@/app/(app)/foglio';

/**
 * Il pannello ha una sola `transform` e tre padroni: il dito, l'entrata,
 * l'uscita. Sbagliare l'ordine non da' errore — fa smettere di funzionare il
 * trascinamento, che e' il gesto che rende credibile tutto il pannello, e ci si
 * accorge solo provandolo con un dito vero.
 */

const versi: Verso[] = ['basso', 'destra'];

describe('trasformaPannello', () => {
  it('a riposo non trasforma niente', () => {
    for (const verso of versi) {
      expect(trasformaPannello({ verso, dentro: true, scostamento: 0 })).toBeUndefined();
    }
  });

  it('prima di entrare e mentre esce sta fuori dallo schermo', () => {
    expect(trasformaPannello({ verso: 'basso', dentro: false, scostamento: 0 })).toBe(
      'translateY(101%)',
    );
    expect(trasformaPannello({ verso: 'destra', dentro: false, scostamento: 0 })).toBe(
      'translateX(101%)',
    );
  });

  it('esce dalla parte da cui e entrato', () => {
    // Un foglio che salisse dal basso e uscisse a destra direbbe che e' andato
    // in un posto in cui non era mai stato.
    expect(trasformaPannello({ verso: 'basso', dentro: false, scostamento: 0 })).toContain('Y(');
    expect(trasformaPannello({ verso: 'destra', dentro: false, scostamento: 0 })).toContain('X(');
  });

  it('il dito vince sullo stato, sempre', () => {
    // E' l'invariante che conta: se lo stato sovrascrivesse il gesto, il
    // pannello si staccherebbe dal polpastrello a meta' trascinamento.
    for (const dentro of [true, false]) {
      expect(trasformaPannello({ verso: 'basso', dentro, scostamento: 120 })).toBe(
        'translateY(120px)',
      );
      expect(trasformaPannello({ verso: 'destra', dentro, scostamento: 80 })).toBe(
        'translateX(80px)',
      );
    }
  });

  it('101% e non 100%', () => {
    // Su uno schermo a densita' frazionaria un 100% esatto lascia a schermo una
    // riga chiara del bordo del pannello.
    expect(trasformaPannello({ verso: 'basso', dentro: false, scostamento: 0 })).toBe(
      'translateY(101%)',
    );
  });
});
