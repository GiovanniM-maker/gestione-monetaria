import { describe, expect, it } from 'vitest';
import { etichettaMovimento } from '@/lib/movimenti/etichetta';

/**
 * Il caso per cui la funzione esiste: un bonifico senza esercente deve dire
 * A CHI sono andati i soldi, non da quale app sono partiti.
 */
describe('etichettaMovimento — chi, non il canale', () => {
  it('un esercente vince su tutto', () => {
    expect(
      etichettaMovimento({
        esercente: 'Deliveroo',
        counterparty_raw: 'Deliveroo Italy s.r.l.',
        raw_description: 'CARD_PAYMENT',
      }),
    ).toBe('Deliveroo');
  });

  it('senza esercente, la controparte batte la causale', () => {
    expect(
      etichettaMovimento({
        esercente: null,
        counterparty_raw: 'Mario Rossi',
        raw_description: 'Inviato da Revolut',
      }),
    ).toBe('Mario Rossi');
  });

  it('senza controparte resta la causale', () => {
    expect(
      etichettaMovimento({ esercente: null, counterparty_raw: null, raw_description: 'Top-Up' }),
    ).toBe('Top-Up');
  });

  it('il vuoto e gli spazi non sono un nome', () => {
    expect(
      etichettaMovimento({ esercente: '  ', counterparty_raw: '', raw_description: null }),
    ).toBe('(senza descrizione)');
  });

  it('i campi possono mancare del tutto (viste piu vecchie della 0053)', () => {
    expect(etichettaMovimento({ esercente: null, raw_description: 'Sent from Revolut' })).toBe(
      'Sent from Revolut',
    );
  });
});
