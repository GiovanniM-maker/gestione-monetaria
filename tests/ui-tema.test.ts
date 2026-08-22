import { describe, expect, it } from 'vitest';
import { leggiTema, risolvi, SCRIPT_TEMA, COLORE_BARRA } from '@/lib/ui/tema';

/**
 * Le due decisioni del tema, piu' la prova che lo script iniziale le prende
 * allo stesso modo. Quest'ultima e' il punto: lo script e' la **seconda
 * scrittura** delle stesse regole, in una forma che deve girare senza React, e
 * due copie di una regola divergono.
 */

describe('leggiTema', () => {
  it('accetta le due scelte esplicite', () => {
    expect(leggiTema('chiaro')).toBe('chiaro');
    expect(leggiTema('scuro')).toBe('scuro');
  });

  it('fallisce verso «sistema», mai verso una tinta', () => {
    // Seguire il telefono e' sempre meno sbagliato che imporre il chiaro a chi
    // aveva scelto lo scuro.
    for (const grezzo of [null, undefined, '', 'dark', 'SCURO', 42, {}]) {
      expect(leggiTema(grezzo)).toBe('sistema');
    }
  });
});

describe('risolvi', () => {
  it('una scelta esplicita vince sul sistema, in tutti e due i versi', () => {
    expect(risolvi('chiaro', true)).toBe('chiaro');
    expect(risolvi('scuro', false)).toBe('scuro');
  });

  it('«sistema» segue il telefono', () => {
    expect(risolvi('sistema', true)).toBe('scuro');
    expect(risolvi('sistema', false)).toBe('chiaro');
  });
});

describe('SCRIPT_TEMA', () => {
  /**
   * Esegue lo script con un `document`, un `window` e un `localStorage` finti.
   *
   * Il finto `document` e' minimo di proposito: se lo script comincia a
   * dipendere da qualcosa che qui non c'e', il test fallisce — ed e' esattamente
   * cio' che serve sapere, perche' questo script gira **prima di React**, dove
   * non c'e' nessuno a raccogliere un errore.
   */
  function esegui(salvato: string | null, sistemaScuro: boolean, conMeta = true) {
    const radice = { dataset: {} as Record<string, string> };
    const attributi = new Map<string, string>();
    const meta = {
      setAttribute: (k: string, v: string) => void attributi.set(k, v),
    };
    const documento = {
      documentElement: radice,
      head: { appendChild: () => {} },
      createElement: () => meta,
      querySelector: () => (conMeta ? meta : null),
    };
    const finestra = {
      matchMedia: () => ({ matches: sistemaScuro }),
      localStorage: { getItem: () => salvato },
    };
    new Function('window', 'document', 'localStorage', SCRIPT_TEMA)(
      finestra,
      documento,
      finestra.localStorage,
    );
    return { tema: radice.dataset['tema'] ?? '', barra: attributi.get('content') ?? '' };
  }

  it('decide come `leggiTema` + `risolvi`, in tutti e sei i casi', () => {
    for (const sistemaScuro of [true, false]) {
      for (const salvato of ['chiaro', 'scuro', null]) {
        const atteso = risolvi(leggiTema(salvato), sistemaScuro);
        expect(esegui(salvato, sistemaScuro).tema).toBe(atteso);
      }
    }
  });

  it('tinge anche la barra di stato, subito', () => {
    // Se arrivasse dopo l'idratazione si vedrebbe una striscia chiara in cima a
    // un'app scura per tutta la durata del caricamento.
    expect(esegui('scuro', false).barra).toBe(COLORE_BARRA.scuro);
    expect(esegui('chiaro', true).barra).toBe(COLORE_BARRA.chiaro);
  });

  it('se il `<meta>` non ce ancora, se lo crea', () => {
    // L'ordine in cui Next mette in `<head>` i propri tag e questo script non
    // e' garantito: dipenderne sarebbe un difetto che si vede solo a volte.
    expect(esegui('scuro', false, false).barra).toBe(COLORE_BARRA.scuro);
  });

  it('un valore illeggibile non impedisce alla pagina di comparire', () => {
    const radice = { dataset: {} as Record<string, string> };
    const documento = {
      documentElement: radice,
      head: { appendChild: () => {} },
      createElement: () => ({ setAttribute: () => {} }),
      querySelector: () => null,
    };
    const finestra = {
      matchMedia: () => ({ matches: true }),
      localStorage: {
        getItem: () => {
          throw new Error('accesso negato');
        },
      },
    };
    expect(() =>
      new Function('window', 'document', 'localStorage', SCRIPT_TEMA)(
        finestra,
        documento,
        finestra.localStorage,
      ),
    ).not.toThrow();
    // E cade sul telefono, non sul chiaro.
    expect(radice.dataset['tema']).toBe('scuro');
  });
});

describe('COLORE_BARRA', () => {
  it('e lo stesso `--s0` delle due tavolozze', () => {
    // Se qui e in `globals.css` divergono, si vede una fascia di un colore che
    // non appartiene a nessuna delle due tinte, sopra l'orologio.
    expect(COLORE_BARRA.chiaro).toBe('#f2f2f7');
    expect(COLORE_BARRA.scuro).toBe('#000000');
  });
});
