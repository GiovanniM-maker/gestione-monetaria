import { describe, expect, it } from 'vitest';
import { analizza, pezzi } from '@/lib/report/testo';

describe('analizza', () => {
  it('riconosce titoli, elenchi e paragrafi', () => {
    expect(
      analizza('## Il mese\n\nHai speso meno.\nRispetto al solito.\n\n- Deliveroo 129 €\n- Coop 229 €'),
    ).toEqual([
      { tipo: 'titolo', testo: 'Il mese' },
      { tipo: 'paragrafo', testo: 'Hai speso meno. Rispetto al solito.' },
      { tipo: 'elenco', voci: ['Deliveroo 129 €', 'Coop 229 €'] },
    ]);
  });

  it('cio’ che non riconosce resta testo, non sparisce', () => {
    // Un renderer severo farebbe sparire la riga, e in un report una frase
    // sparita non si nota.
    const blocchi = analizza('> una citazione\n| una tabella |');
    expect(blocchi).toEqual([
      { tipo: 'paragrafo', testo: '> una citazione | una tabella |' },
    ]);
  });

  it('su un testo vuoto non produce blocchi', () => {
    expect(analizza('')).toEqual([]);
    expect(analizza('\n\n   \n')).toEqual([]);
  });
});

describe('pezzi', () => {
  it('spezza il grassetto', () => {
    expect(pezzi('Hai speso **3.640,32 €** questo mese.')).toEqual([
      { testo: 'Hai speso ', forte: false },
      { testo: '3.640,32 €', forte: true },
      { testo: ' questo mese.', forte: false },
    ]);
  });

  it('un asterisco spaiato non si mangia il resto della frase', () => {
    expect(pezzi('Hai speso **molto e poi altro')).toEqual([
      { testo: 'Hai speso ', forte: false },
      { testo: 'molto e poi altro', forte: false },
    ]);
  });

  it('senza grassetto e’ un pezzo solo', () => {
    expect(pezzi('Niente di speciale.')).toEqual([
      { testo: 'Niente di speciale.', forte: false },
    ]);
  });
});
