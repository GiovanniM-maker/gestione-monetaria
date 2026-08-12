import { describe, expect, it } from 'vitest';
import { estremiDelMese, indirizzo, leggiFiltri } from '@/lib/movimenti/filtri';

const VUOTI = leggiFiltri({});

describe('leggiFiltri — un filtro inventato non deve arrivare al database', () => {
  it('senza parametri filtra le spese, per data, prima pagina', () => {
    expect(VUOTI.tipo).toBe('spesa');
    expect(VUOTI.ordine).toBe('data');
    expect(VUOTI.pagina).toBe(1);
    expect(VUOTI.ricerca).toBe('');
    expect(VUOTI.da).toBeNull();
  });

  it('scarta i valori non ammessi invece di passarli', () => {
    const f = leggiFiltri({ tipo: 'tutto', ordine: 'a caso', classe: 'inventata' });
    expect(f.tipo).toBe('spesa');
    expect(f.ordine).toBe('data');
    expect(f.discrezionalita).toBeNull();
  });

  it('accetta solo date vere e solo identificativi veri', () => {
    expect(leggiFiltri({ da: '2026-07-01' }).da).toBe('2026-07-01');
    expect(leggiFiltri({ da: '1 luglio' }).da).toBeNull();
    expect(leggiFiltri({ da: '2026-7-1' }).da).toBeNull();

    const uuid = 'a0000000-0000-0000-0000-000000000001';
    expect(leggiFiltri({ categoria: uuid }).categoria).toBe(uuid);
    // Un identificativo storto non deve arrivare a Postgres, che risponderebbe
    // con un errore di cast invece che con una lista.
    expect(leggiFiltri({ categoria: "1' or '1'='1" }).categoria).toBeNull();
  });

  it('una pagina non valida e’ la prima', () => {
    for (const pagina of ['0', '-3', 'due', '1.5', '']) {
      expect(leggiFiltri({ pagina }).pagina).toBe(1);
    }
    expect(leggiFiltri({ pagina: '7' }).pagina).toBe(7);
  });

  it('prende il primo valore quando un parametro e’ ripetuto', () => {
    expect(leggiFiltri({ tipo: ['entrate', 'giroconti'] }).tipo).toBe('entrate');
  });
});

describe('indirizzo — quello che si puo’ mandare a se’ stessi', () => {
  it('senza filtri e’ l’indirizzo nudo', () => {
    expect(indirizzo(VUOTI)).toBe('/movimenti');
  });

  it('omette i valori predefiniti invece di scriverli', () => {
    // `tipo=spesa` e `ordine=data` sono i valori normali: metterli
    // nell'indirizzo lo allunga senza dire niente.
    expect(indirizzo(VUOTI, { ricerca: 'lidl' })).toBe('/movimenti?q=lidl');
  });

  it('cambiare un filtro riporta alla prima pagina', () => {
    const a_pagina_sette = leggiFiltri({ pagina: '7', q: 'lidl' });
    expect(indirizzo(a_pagina_sette, { ricerca: 'coop' })).toBe('/movimenti?q=coop');
  });

  it('la pagina si scrive solo quando e’ lei a cambiare', () => {
    const f = leggiFiltri({ q: 'lidl' });
    expect(indirizzo(f, { pagina: 3 })).toBe('/movimenti?q=lidl&pagina=3');
  });
});

describe('estremiDelMese', () => {
  it('trova l’ultimo giorno senza doverlo ricordare', () => {
    expect(estremiDelMese('2026-07')).toEqual({ da: '2026-07-01', a: '2026-07-31' });
    expect(estremiDelMese('2026-06')).toEqual({ da: '2026-06-01', a: '2026-06-30' });
  });

  it('febbraio bisestile e non', () => {
    expect(estremiDelMese('2028-02')?.a).toBe('2028-02-29');
    expect(estremiDelMese('2026-02')?.a).toBe('2026-02-28');
  });

  it('dicembre non scavalca nell’anno dopo', () => {
    expect(estremiDelMese('2025-12')).toEqual({ da: '2025-12-01', a: '2025-12-31' });
  });

  it('su un mese non valido risponde null', () => {
    expect(estremiDelMese('2026-13')).toBeNull();
  });
});
