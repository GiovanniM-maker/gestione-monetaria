import { describe, expect, it } from 'vitest';
import {
  descriviFiltri,
  estremiDelMese,
  filtriAttivi,
  indirizzo,
  leggiFiltri,
} from '@/lib/movimenti/filtri';

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
    const f = leggiFiltri({ tipo: 'tutto', ordine: 'a caso', contesto: 'altrove' });
    expect(f.tipo).toBe('spesa');
    expect(f.ordine).toBe('data');
    expect(f.contesto).toBeNull();
  });

  /**
   * La classe si controlla nella **forma**, non nell'elenco.
   *
   * Le classi si creano mentre l'app e' accesa, e questo modulo e' puro — non
   * puo' sapere quali esistano, ed e' proprio quella purezza a permettere di
   * provarlo qui invece che con un database. Uno slug che non esiste non trova
   * righe, e va benissimo: finisce in un argomento della RPC, non in una
   * stringa di query.
   *
   * Il controllo di forma serve lo stesso: senza, qualunque testo arrivato
   * dall'indirizzo finirebbe stampato nella riga che descrive i filtri.
   */
  it('accetta una classe che il codice non conosce, e rifiuta cio’ che non e’ uno slug', () => {
    expect(leggiFiltri({ classe: 'risparmio' }).discrezionalita).toBe('risparmio');
    expect(leggiFiltri({ classe: 'sfizi-del-sabato' }).discrezionalita).toBe('sfizi-del-sabato');
    expect(leggiFiltri({ classe: 'Voluttuario' }).discrezionalita).toBeNull();
    expect(leggiFiltri({ classe: "x'; drop table" }).discrezionalita).toBeNull();
    expect(leggiFiltri({ classe: '-inizia-male' }).discrezionalita).toBeNull();
  });

  it('accetta «senza-categoria», che un uuid non e’', () => {
    // Nei dati e' un category_id nullo, e null un indirizzo non lo sa dire.
    // `cercaMovimenti` lo traduce nel flag p_senza_categoria della RPC.
    expect(leggiFiltri({ categoria: 'senza-categoria' }).categoria).toBe('senza-categoria');
    // Ma ogni altro testo che non e' un uuid resta fuori come prima.
    expect(leggiFiltri({ categoria: 'ristoranti' }).categoria).toBeNull();
  });

  it('descrive il filtro «senza categoria» senza chiamarlo «una categoria»', () => {
    const f = leggiFiltri({ categoria: 'senza-categoria' });
    expect(descriviFiltri(f)).toContain('senza categoria');
  });

  it('accetta la pseudo-classe «non classificato», che uno slug non e’', () => {
    // Ha uno spazio, e la forma degli slug la rifiutava: dal cruscotto,
    // toccare «non classificato» apriva TUTTE le spese del mese — il filtro
    // veniva scartato in silenzio, che e' la lista plausibile e sbagliata da
    // cui questo modulo dichiara di difendersi.
    expect(leggiFiltri({ classe: 'non classificato' }).discrezionalita).toBe('non classificato');
    // Ma resta un'eccezione puntuale, non un allargamento della forma: ogni
    // altro testo con uno spazio e' ancora fuori.
    expect(leggiFiltri({ classe: 'non  classificato' }).discrezionalita).toBeNull();
    expect(leggiFiltri({ classe: 'qualcosa altro' }).discrezionalita).toBeNull();
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

describe('descriviFiltri — il riassunto che sostituisce sette controlli aperti', () => {
  it('senza filtri dice comunque il tipo: e\u2019 cio\u2019 che spiega il totale', () => {
    expect(descriviFiltri(VUOTI)).toEqual(['spese reali']);
  });

  it('un intervallo completo e\u2019 una voce sola, uno solo dei due no', () => {
    const f = leggiFiltri({ da: '2026-07-01', a: '2026-07-31' });
    expect(descriviFiltri(f)).toContain('2026-07-01 \u2192 2026-07-31');
    expect(descriviFiltri(leggiFiltri({ da: '2026-07-01' }))).toContain('dal 2026-07-01');
    expect(descriviFiltri(leggiFiltri({ a: '2026-07-31' }))).toContain('fino al 2026-07-31');
  });

  it('usa i nomi quando li riceve, e non inventa quando non li ha', () => {
    const f = leggiFiltri({ categoria: '11111111-1111-1111-1111-111111111111' });
    expect(descriviFiltri(f, { categoria: 'Ristorazione > Ristoranti' })).toContain(
      'Ristorazione > Ristoranti',
    );
    expect(descriviFiltri(f)).toContain('una categoria');
  });

  it('la ricerca compare fra virgolette, non come parola nuda', () => {
    expect(descriviFiltri(leggiFiltri({ q: 'deliveroo' }))).toContain('\u00abdeliveroo\u00bb');
  });
});

describe('filtriAttivi — il solo tipo non e\u2019 un filtro', () => {
  it('senza parametri non c\u2019e\u2019 niente da togliere', () => {
    expect(filtriAttivi(VUOTI)).toBe(false);
    expect(filtriAttivi(leggiFiltri({ tipo: 'giroconti' }))).toBe(false);
  });

  it('qualsiasi restrizione lo accende', () => {
    expect(filtriAttivi(leggiFiltri({ q: 'x' }))).toBe(true);
    expect(filtriAttivi(leggiFiltri({ da: '2026-07-01' }))).toBe(true);
    expect(filtriAttivi(leggiFiltri({ classe: 'voluttuario' }))).toBe(true);
  });
});
