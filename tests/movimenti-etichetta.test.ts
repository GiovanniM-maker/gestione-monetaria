import { describe, expect, it } from 'vitest';
import { etichettaMovimento } from '@/lib/movimenti/etichetta';

describe('etichettaMovimento', () => {
  it('preferisce l’esercente a tutto il resto', () => {
    expect(
      etichettaMovimento({
        esercente: 'Deliveroo',
        counterparty_raw: 'Deliveroo Italy Srl',
        raw_description: 'DELIVEROO*1234',
      }),
    ).toBe('Deliveroo');
  });

  it('senza esercente dice CHI, non COME', () => {
    // Il caso vero: Revolut scrive la stessa frase sull'affitto, sulla farmacia
    // e sui trenta euro a un amico. Come nome non distingue niente.
    expect(
      etichettaMovimento({
        esercente: null,
        counterparty_raw: 'Antonella Mole',
        raw_description: 'Sent from Revolut',
      }),
    ).toBe('Antonella Mole');
  });

  it('ripiega sulla causale quando la controparte non c’e’', () => {
    expect(
      etichettaMovimento({ esercente: null, counterparty_raw: null, raw_description: 'Rimborso' }),
    ).toBe('Rimborso');
  });

  it('tratta una stringa vuota come assente', () => {
    // Un campo che c'e' e non dice niente non deve vincere su uno che parla:
    // altrimenti l'etichetta diventa uno spazio bianco.
    expect(
      etichettaMovimento({ counterparty_raw: '   ', raw_description: 'Sent from Revolut' }),
    ).toBe('Sent from Revolut');
    expect(etichettaMovimento({ esercente: '', counterparty_raw: 'Linda Nanni' })).toBe(
      'Linda Nanni',
    );
  });

  it('quando non c’e’ niente lo dice, invece di restare vuota', () => {
    expect(etichettaMovimento({})).toBe('(senza descrizione)');
    expect(
      etichettaMovimento({ esercente: null, counterparty_raw: null, raw_description: null }),
    ).toBe('(senza descrizione)');
  });

  it('toglie gli spazi intorno', () => {
    expect(etichettaMovimento({ esercente: '  Netflix  ' })).toBe('Netflix');
  });
});
