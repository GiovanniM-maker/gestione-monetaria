import { describe, expect, it } from 'vitest';
import { descriviObiettivo, descriviScadenza, fraMesi } from '@/lib/copilota/obiettivi';

/**
 * `fraMesi` calcola la scadenza di un obiettivo, ed e' aritmetica su giorni
 * civili: vale la stessa regola di `booking_date`. `setMonth` su una data letta
 * in UTC e riletta in `Europe/Rome` puo' tornare al giorno prima, e una
 * scadenza sbagliata di un giorno non si vede mai — si vede solo l'obiettivo
 * che scade prima del previsto, mesi dopo.
 */
describe('fraMesi', () => {
  it('somma i mesi restando nello stesso anno', () => {
    expect(fraMesi(6, new Date('2026-01-15T12:00:00Z'))).toBe('2026-07-15');
  });

  it('attraversa il capodanno', () => {
    expect(fraMesi(6, new Date('2026-09-10T12:00:00Z'))).toBe('2027-03-10');
    expect(fraMesi(12, new Date('2026-08-19T12:00:00Z'))).toBe('2027-08-19');
  });

  it('si ferma all’ultimo giorno del mese di arrivo', () => {
    // «Fra un mese» dal 31 marzo e' il 30 aprile, non il 1° maggio: sconfinare
    // sposterebbe la scadenza in un mese che l'utente non ha scelto.
    expect(fraMesi(1, new Date('2026-03-31T12:00:00Z'))).toBe('2026-04-30');
    expect(fraMesi(1, new Date('2026-01-31T12:00:00Z'))).toBe('2026-02-28');
  });

  it('regge l’anno bisestile', () => {
    expect(fraMesi(1, new Date('2028-01-31T12:00:00Z'))).toBe('2028-02-29');
  });

  it('non torna indietro di un giorno a cavallo della mezzanotte UTC', () => {
    // Le 23:30 UTC del 19 agosto sono l'1:30 del 20 a Roma. La scadenza deve
    // contarsi dal giorno civile italiano, che e' il 20.
    expect(fraMesi(6, new Date('2026-08-19T23:30:00Z'))).toBe('2027-02-20');
  });

  it('con un mese solo resta un mese', () => {
    expect(fraMesi(1, new Date('2026-08-19T12:00:00Z'))).toBe('2026-09-19');
  });
});

/**
 * La frase che descrive un obiettivo sta in un posto solo perche' era in tre —
 * la schermata, il prompt del copilota e la descrizione della proposta. Tre
 * copie divergono, e qui divergere significa approvare una proposta che dice
 * una cosa e ritrovarne scritta un'altra nell'elenco.
 */
describe('descriviObiettivo', () => {
  const base = { valore: null, categoria: null, classe_nome: null };

  it('dice il tetto con la cifra e il bersaglio', () => {
    expect(
      descriviObiettivo({
        ...base,
        tipo: 'tetto_di_spesa',
        valore: '300.00',
        categoria: 'Ristoranti',
      }),
    ).toBe('Non più di 300.00 € al mese in Ristoranti');
  });

  it('accetta la classe al posto della categoria', () => {
    expect(descriviObiettivo({ ...base, tipo: 'ridurre', classe_nome: 'Voluttuario' })).toBe(
      'Spendere meno in Voluttuario',
    );
  });

  it('la liquidità e il risparmio non hanno un dove', () => {
    expect(descriviObiettivo({ ...base, tipo: 'liquidita_minima', valore: '5000.00' })).toBe(
      'Tenere almeno 5000.00 € sul conto',
    );
    expect(descriviObiettivo({ ...base, tipo: 'risparmiare', valore: '2000.00' })).toBe(
      'Mettere da parte 2000.00 €',
    );
  });

  it('senza cifra non inventa uno zero', () => {
    // Uno zero sarebbe un limite vero e falso: «non più di 0 € al mese» è una
    // frase che significa qualcosa, e non è quello che manca.
    expect(descriviObiettivo({ ...base, tipo: 'tetto_di_spesa' })).toContain('—');
  });

  it('«ridurre» senza bersaglio resta una frase, non una monca', () => {
    expect(descriviObiettivo({ ...base, tipo: 'ridurre' })).toBe('Spendere meno');
  });
});

describe('descriviScadenza — i due versi non si confondono', () => {
  const q = (g: number) =>
    descriviScadenza({ giorni_alla_scadenza: g, valido_fino_a: '2027-02-19' });

  it('scaduto è un fatto compiuto', () => {
    expect(q(-1)).toBe('scaduto da 1 giorno');
    expect(q(-65)).toBe('scaduto da 65 giorni');
  });

  it('in scadenza è un avviso', () => {
    expect(q(0)).toBe('scade oggi');
    expect(q(1)).toBe('scade domani');
    expect(q(12)).toBe('scade fra 12 giorni');
  });

  it('oltre il mese dice la data, non un conto alla rovescia', () => {
    // «Scade fra 184 giorni» non è un'informazione che qualcuno usa: la data
    // sì, e non chiede di essere ricalcolata a mente.
    expect(q(184)).toBe('vale fino al 2027-02-19');
  });

  it('il confine fra le due forme è il trentesimo giorno', () => {
    expect(q(30)).toContain('fra 30');
    expect(q(31)).toContain('fino al');
  });
});
