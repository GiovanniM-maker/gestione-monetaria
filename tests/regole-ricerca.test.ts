import { describe, expect, it } from 'vitest';
import { interrogazione, motivoDelRifiuto } from '@/lib/tassonomia/regole-ricerca';

/**
 * La regola 8b è più stretta della 8, e la ragione è che un'interrogazione di
 * ricerca finisce in log che non controlliamo e non si cancella. Questi test
 * sono l'ultimo controllo prima della rete.
 */

describe('cosa può essere cercato', () => {
  it('lascia passare i nomi di esercente, cifre del punto vendita comprese', () => {
    for (const nome of [
      'Bruno Spa Modica',
      'Aspit Campogalliano',
      'Lidl 1361',
      'Starbucks 17831',
      'Poundland Ltd - 2205',
      'apple.com/bill',
      "Pizzeria L'angolo",
    ]) {
      expect(motivoDelRifiuto(nome), nome).toBeNull();
    }
  });

  it('manda il nome e nient’altro', () => {
    // Nessuna parola aggiunta: né «cos'è», né «negozio», né la città. Una
    // parola in più orienta il risultato verso ciò che ci aspettiamo, e un
    // motore che conferma l'ipotesi è peggio di nessun motore.
    expect(interrogazione('  Bruno   Spa  Modica ')).toBe('Bruno Spa Modica');
  });
});

describe('cosa non esce, e fallisce chiuso', () => {
  it('rifiuta un IBAN, anche spezzato da spazi', () => {
    expect(motivoDelRifiuto('IT60X0542811101000000123456')).toBe('sembra un IBAN');
    expect(motivoDelRifiuto('IT 60 X054 2811 1010 0000 0123 456')).toBe('sembra un IBAN');
  });

  it('rifiuta un indirizzo email', () => {
    expect(motivoDelRifiuto('mario.rossi@example.com')).toBe('sembra un indirizzo email');
  });

  it('rifiuta una sequenza di cifre da carta o telefono', () => {
    expect(motivoDelRifiuto('4539 1488 0343 6467')).toBe(
      'contiene una sequenza di cifre troppo lunga',
    );
  });

  it('rifiuta qualunque cosa contenga un importo', () => {
    // Un nome di esercente non contiene un prezzo: se c'è, chi ha costruito
    // l'interrogazione ha attaccato al nome qualcosa che non doveva.
    expect(motivoDelRifiuto('Deliveroo 129,76 €')).toBe('contiene un importo');
    expect(motivoDelRifiuto('Booking.com € 1.080')).toBe('contiene un importo');
    expect(motivoDelRifiuto('Bruno Spa 296,61')).toBe('contiene un importo');
  });

  it('rifiuta il vuoto e le sigle troppo corte', () => {
    expect(motivoDelRifiuto('   ')).toBe('vuoto');
    expect(motivoDelRifiuto('AB')).toBe('troppo corto');
  });

  it('un nome rifiutato non produce nessuna interrogazione', () => {
    expect(interrogazione('IT60X0542811101000000123456')).toBeNull();
    expect(interrogazione('Deliveroo 129,76 €')).toBeNull();
  });
});
