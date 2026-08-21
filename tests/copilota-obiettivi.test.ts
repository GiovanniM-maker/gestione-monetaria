import { describe, expect, it } from 'vitest';
import { fraMesi } from '@/lib/copilota/obiettivi';

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
