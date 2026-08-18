import { describe, expect, it } from 'vitest';
import { converti, dividiArrotondando, formattaCentesimi, parseCentesimi } from '@/lib/money';
import {
  normalizzaMovimento,
  normalizzaNome,
  riconosciGiroconto,
  ripulisciCausale,
} from '@/lib/normalize/movimento';
import { riferimentiSuPiuConti } from '@/lib/normalize/run';

const CONTESTO = {
  valutaConto: 'EUR',
  nomiContiPropri: ['conto deposito senza vincoli'],
};

const CONTO = '11111111-2222-3333-4444-555555555555';

/** Movimento reale, ridotto ai campi che il normalizzatore legge. */
function movimento(sovrascritture: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    entry_reference: '0554fc6a-67f0-e349-0280-16848dd82d3d',
    transaction_amount: { currency: 'EUR', amount: '6.99' },
    credit_debit_indicator: 'DBIT',
    status: 'BOOK',
    booking_date: '2026-08-11',
    value_date: '2026-08-12',
    creditor: { name: 'Prime Video   Canale' },
    debtor: { name: 'GIOVANNI GRAZIANO MAVILLA' },
    bank_transaction_code: { code: 'CARD_PAYMENT' },
    remittance_information: ['Prime Video   Canale'],
    exchange_rate: null,
    ...sovrascritture,
  };
}

describe('money', () => {
  it('parsa gli importi senza passare da float', () => {
    expect(parseCentesimi('6.99')).toBe(699n);
    expect(parseCentesimi('-12.34')).toBe(-1234n);
    expect(parseCentesimi('100')).toBe(10000n);
    expect(parseCentesimi('0.5')).toBe(50n);
    expect(parseCentesimi('0.00')).toBe(0n);
  });

  it('rifiuta piu di due decimali invece di arrotondare in silenzio', () => {
    expect(() => parseCentesimi('1.234')).toThrow(/non valido/);
  });

  it('sopravvive a un importo che in float sarebbe sbagliato', () => {
    // 0.1 + 0.2 !== 0.3 in virgola mobile. In centesimi e' esatto.
    expect(parseCentesimi('0.10') + parseCentesimi('0.20')).toBe(parseCentesimi('0.30'));
  });

  it('formatta con due decimali sempre', () => {
    expect(formattaCentesimi(699n)).toBe('6.99');
    expect(formattaCentesimi(-1234n)).toBe('-12.34');
    expect(formattaCentesimi(50n)).toBe('0.50');
    expect(formattaCentesimi(0n)).toBe('0.00');
    expect(formattaCentesimi(-5n)).toBe('-0.05');
  });

  it('arrotonda half away from zero, anche in negativo', () => {
    // La differenza che conta: Math.round(-0.5) darebbe -0.
    expect(dividiArrotondando(5n, 10n)).toBe(1n);
    expect(dividiArrotondando(-5n, 10n)).toBe(-1n);
    expect(dividiArrotondando(4n, 10n)).toBe(0n);
    expect(dividiArrotondando(-4n, 10n)).toBe(0n);
    expect(dividiArrotondando(15n, 10n)).toBe(2n);
    expect(dividiArrotondando(-15n, 10n)).toBe(-2n);
  });

  it('converte applicando il tasso una volta sola', () => {
    expect(converti(10000n, '1')).toBe(10000n);
    expect(converti(-10000n, '1.1')).toBe(-11000n);
    expect(converti(999n, '0.86')).toBe(859n);
  });
});

describe('normalizzaMovimento', () => {
  it('rende negative le uscite, che l API restituisce positive', () => {
    const m = normalizzaMovimento(movimento(), CONTO, CONTESTO);
    expect(m.amount).toBe('-6.99');
    expect(m.amount_eur).toBe('-6.99');
  });

  it('lascia positive le entrate', () => {
    const m = normalizzaMovimento(movimento({ credit_debit_indicator: 'CRDT' }), CONTO, CONTESTO);
    expect(m.amount).toBe('6.99');
  });

  it('in assenza di indicatore assume uscita', () => {
    // Sovrastimare le spese e' meno dannoso che nasconderle.
    const m = normalizzaMovimento(movimento({ credit_debit_indicator: null }), CONTO, CONTESTO);
    expect(m.amount).toBe('-6.99');
  });

  it('gestisce le preautorizzazioni a zero senza inventare un segno', () => {
    const m = normalizzaMovimento(
      movimento({ transaction_amount: { currency: 'EUR', amount: '0.00' } }),
      CONTO,
      CONTESTO,
    );
    expect(m.amount).toBe('0.00');
  });

  it('mappa PDNG su pending e conserva value_date assente', () => {
    const m = normalizzaMovimento(movimento({ status: 'PDNG', value_date: null }), CONTO, CONTESTO);
    expect(m.status).toBe('pending');
    expect(m.value_date).toBeNull();
    expect(m.booking_date).toBe('2026-08-11');
  });

  it('usa entry_reference come chiave e non genera un fallback', () => {
    const m = normalizzaMovimento(movimento(), CONTO, CONTESTO);
    expect(m.external_id).toBe('0554fc6a-67f0-e349-0280-16848dd82d3d');
    expect(m.dedupe_key).toBeNull();
  });

  it('genera una chiave stabile quando entry_reference manca', () => {
    const senza = movimento({ entry_reference: null });
    const a = normalizzaMovimento(senza, CONTO, CONTESTO);
    const b = normalizzaMovimento(senza, CONTO, CONTESTO);
    expect(a.external_id).toBeNull();
    expect(a.dedupe_key).toBe(b.dedupe_key);
    expect(a.dedupe_key).toHaveLength(64);
  });

  it('non converte in euro se la valuta e altra e manca il tasso', () => {
    const m = normalizzaMovimento(
      movimento({ transaction_amount: { currency: 'GBP', amount: '10.00' } }),
      CONTO,
      { ...CONTESTO, valutaConto: 'GBP' },
    );
    expect(m.amount).toBe('-10.00');
    expect(m.amount_eur).toBeNull();
    expect(m.fx_rate).toBeNull();
  });

  it('converte in euro quando il tasso c e', () => {
    const m = normalizzaMovimento(
      movimento({
        transaction_amount: { currency: 'GBP', amount: '10.00' },
        exchange_rate: '1.17',
      }),
      CONTO,
      { ...CONTESTO, valutaConto: 'GBP' },
    );
    expect(m.amount_eur).toBe('-11.70');
    expect(m.fx_date).toBe('2026-08-11');
  });

  it('riconosce il rimborso su carta', () => {
    const m = normalizzaMovimento(
      movimento({
        credit_debit_indicator: 'CRDT',
        bank_transaction_code: { code: 'CARD_CREDIT' },
      }),
      CONTO,
      CONTESTO,
    );
    expect(m.is_refund).toBe(true);
  });

  it('riconosce il rimborso anche quando la banca lo chiama CARD_REFUND', () => {
    // Il caso vero: 506,63 € restituiti da Booking.com il 26 giugno 2026.
    // Con il solo CARD_CREDIT passava il filtro e finiva nelle **entrate**,
    // cioe' veniva contato come reddito.
    const m = normalizzaMovimento(
      movimento({
        credit_debit_indicator: 'CRDT',
        bank_transaction_code: { code: 'CARD_REFUND' },
        transaction_amount: { currency: 'EUR', amount: '506.63' },
      }),
      CONTO,
      CONTESTO,
    );
    expect(m.is_refund).toBe(true);
    expect(m.amount).toBe('506.63');
  });

  it('NON chiama rimborso uno stipendio', () => {
    // Un'entrata vera resta un'entrata: `is_refund` la toglierebbe dal
    // denominatore, e la spesa sembrerebbe una quota piu' alta di quel che e'.
    const m = normalizzaMovimento(
      movimento({
        credit_debit_indicator: 'CRDT',
        bank_transaction_code: { code: 'TRANSFER' },
        remittance_information: ['Compenso'],
        debtor: { name: 'Un Cliente Srl' },
      }),
      CONTO,
      CONTESTO,
    );
    expect(m.is_refund).toBe(false);
  });

  it('la gamba in uscita di un cambio valuta non e’ spesa', () => {
    // La gamba negativa e' l'errore piu' grave dei due: `amount < 0` piu'
    // `is_transfer` falso sono esattamente le condizioni di `v_expenses`, quindi
    // i 500 € usciti il 6 giugno 2026 per essere ricambiati il 7 e l'8 erano
    // spesa reale nel numero per cui l'applicazione esiste.
    const m = normalizzaMovimento(
      movimento({
        credit_debit_indicator: 'DBIT',
        bank_transaction_code: { code: 'EXCHANGE' },
        remittance_information: ['Exchanged to GBP'],
        transaction_amount: { currency: 'EUR', amount: '500.00' },
      }),
      CONTO,
      CONTESTO,
    );
    expect(m.amount).toBe('-500.00');
    expect(m.is_transfer).toBe(true);
  });

  it('un cambio valuta e’ un giroconto, non un’entrata', () => {
    // «Exchanged to EUR»: 250,72 e 242,07 € di giugno risultavano reddito.
    const m = normalizzaMovimento(
      movimento({
        credit_debit_indicator: 'CRDT',
        bank_transaction_code: { code: 'EXCHANGE' },
        remittance_information: ['Exchanged to EUR'],
        transaction_amount: { currency: 'EUR', amount: '250.72' },
      }),
      CONTO,
      CONTESTO,
    );
    expect(m.is_transfer).toBe(true);
    // E non un rimborso: il denaro non torna da un acquisto, si sposta fra due
    // saldi. Due bandierine per lo stesso fatto direbbero due cose diverse a
    // `fuori_dalla_spesa`.
    expect(m.is_refund).toBe(false);
  });

  it('rifiuta un payload senza importo invece di scrivere zero', () => {
    expect(() =>
      normalizzaMovimento(movimento({ transaction_amount: null }), CONTO, CONTESTO),
    ).toThrow(/transaction_amount/);
  });
});

describe('riconosciGiroconto', () => {
  const giroconto = (causale: string, codice = 'TRANSFER') =>
    riconosciGiroconto(
      movimento({
        bank_transaction_code: { code: codice },
        remittance_information: [causale],
      }),
      CONTESTO.nomiContiPropri,
    );

  it('riconosce i pocket in valuta', () => {
    expect(giroconto('To EUR')).toBe(true);
    expect(giroconto('From USD')).toBe(true);
  });

  it('riconosce un pocket anche con l identificativo tecnico in coda', () => {
    // Senza ripulire il suffisso, questa riga sfuggirebbe al riconoscimento.
    expect(giroconto('To EUR MB:b260c88e-a671-46f7-bba0-86729951cb11')).toBe(true);
  });

  it('riconosce un conto proprio chiamato per nome', () => {
    expect(giroconto('From Conto deposito senza vincoli')).toBe(true);
  });

  it('NON marca come giroconto un bonifico a una persona', () => {
    // Stesso codice, stessa forma "To ...": e' il caso che rende insufficiente
    // il solo bank_transaction_code, ed e' denaro uscito davvero.
    expect(giroconto('To Annachiara F')).toBe(false);
    expect(giroconto('To Vanna Reverberi')).toBe(false);
  });

  it('NON marca come giroconto un pagamento con carta', () => {
    expect(giroconto('To EUR', 'CARD_PAYMENT')).toBe(false);
  });

  it('riconosce il cambio valuta dal codice, qualunque cosa dica la causale', () => {
    // Un `EXCHANGE` sposta denaro fra due saldi dello stesso utente: non ha una
    // controparte, quindi non c'e' niente da interpretare. Legarlo alla frase
    // «Exchanged to EUR» lo farebbe sfuggire alla prima variante che la banca
    // decide di scrivere.
    expect(giroconto('Exchanged to EUR', 'EXCHANGE')).toBe(true);
    expect(giroconto('Exchanged from GBP', 'EXCHANGE')).toBe(true);
    expect(giroconto('Cambio', 'EXCHANGE')).toBe(true);
  });

  it('riconosce il cambio valuta anche senza causale', () => {
    expect(
      riconosciGiroconto(
        movimento({
          bank_transaction_code: { code: 'EXCHANGE' },
          remittance_information: null,
        }),
        CONTESTO.nomiContiPropri,
      ),
    ).toBe(true);
  });
});

describe('ripulisciCausale', () => {
  it('rimuove l identificativo tecnico in coda', () => {
    expect(ripulisciCausale('To EUR MB:b260c88e-a671-46f7-bba0-86729951cb11')).toBe('To EUR');
  });

  it('non tocca una causale normale', () => {
    expect(ripulisciCausale('Anthropic* Claude Sub')).toBe('Anthropic* Claude Sub');
  });

  it('compatta gli spazi doppi', () => {
    expect(ripulisciCausale('Prime Video   Canale')).toBe('Prime Video Canale');
  });
});

describe('normalizzaNome', () => {
  it('confronta ignorando maiuscole e spaziatura', () => {
    expect(normalizzaNome('  Conto   Deposito Senza Vincoli ')).toBe(
      'conto deposito senza vincoli',
    );
  });
});

describe('riferimentiSuPiuConti', () => {
  it('riconosce un giroconto dallo stesso riferimento su due conti', () => {
    // E' la prova strutturale: la banca registra lo stesso entry_reference su
    // entrambi i lati dello spostamento.
    const condivisi = riferimentiSuPiuConti([
      { account_id: 'conto-a', riferimento: 'rif-1' },
      { account_id: 'conto-b', riferimento: 'rif-1' },
      { account_id: 'conto-a', riferimento: 'rif-2' },
    ]);
    expect([...condivisi]).toEqual(['rif-1']);
  });

  it('non confonde due versioni dello stesso movimento sullo stesso conto', () => {
    // PDNG e BOOK stanno sullo stesso conto: non sono un giroconto.
    const condivisi = riferimentiSuPiuConti([
      { account_id: 'conto-a', riferimento: 'rif-1' },
      { account_id: 'conto-a', riferimento: 'rif-1' },
    ]);
    expect(condivisi.size).toBe(0);
  });

  it('ignora i movimenti senza riferimento', () => {
    const condivisi = riferimentiSuPiuConti([
      { account_id: 'conto-a', riferimento: null },
      { account_id: 'conto-b', riferimento: null },
    ]);
    expect(condivisi.size).toBe(0);
  });
});

describe('riconosciGiroconto con controparti dichiarate', () => {
  const propri = ['conto deposito senza vincoli', 'giovanni graziano mavilla'];

  it('riconosce il deposito presso un altro istituto dalla causale', () => {
    // L'altro lato non esiste nei nostri dati: senza la dichiarazione
    // dell'utente questo movimento resterebbe contato come spesa.
    expect(
      riconosciGiroconto(
        movimento({
          bank_transaction_code: { code: 'TRANSFER' },
          remittance_information: ['To Conto deposito senza vincoli'],
        }),
        propri,
      ),
    ).toBe(true);
  });

  it('riconosce il bonifico verso un proprio conto dal nome della controparte', () => {
    expect(
      riconosciGiroconto(
        movimento({
          bank_transaction_code: { code: 'TRANSFER' },
          creditor: { name: 'Giovanni Graziano Mavilla' },
          remittance_information: ['Bonifico'],
        }),
        propri,
      ),
    ).toBe(true);
  });

  it('continua a NON marcare un bonifico a un terzo', () => {
    expect(
      riconosciGiroconto(
        movimento({
          bank_transaction_code: { code: 'TRANSFER' },
          creditor: { name: 'Vanna Reverberi' },
          remittance_information: ['To Vanna Reverberi'],
        }),
        propri,
      ),
    ).toBe(false);
  });
});

describe('la controparte dipende dalla direzione', () => {
  const propri = ['giovanni graziano mavilla'];

  it('su un uscita guarda il creditore, non il debitore', () => {
    // Su ogni uscita il debitore e' l'intestatario del conto. Guardarlo
    // marcherebbe come giroconto qualunque bonifico, cancellando spese reali.
    expect(
      riconosciGiroconto(
        movimento({
          credit_debit_indicator: 'DBIT',
          bank_transaction_code: { code: 'TRANSFER' },
          creditor: { name: 'Vanna Reverberi' },
          debtor: { name: 'Giovanni Graziano Mavilla' },
          remittance_information: ['To Vanna Reverberi'],
        }),
        propri,
      ),
    ).toBe(false);
  });

  it('su un entrata guarda il debitore', () => {
    expect(
      riconosciGiroconto(
        movimento({
          credit_debit_indicator: 'CRDT',
          bank_transaction_code: { code: 'TRANSFER' },
          creditor: { name: 'Giovanni Graziano Mavilla' },
          debtor: { name: 'Giovanni Graziano Mavilla' },
          remittance_information: ['Bonifico'],
        }),
        propri,
      ),
    ).toBe(true);
  });
});
