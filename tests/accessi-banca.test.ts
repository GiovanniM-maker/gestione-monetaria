import { describe, expect, it } from 'vitest';
import { decidiAccesso } from '@/lib/sync/quotidiano';

/**
 * Il tetto e' della PSD2, non nostro: quattro letture del conto in
 * ventiquattr'ore quando il cliente non e' presente. La schedulazione e' a
 * quattro ore — sei giri — quindi i due giri di troppo devono saltare lo
 * scarico invece di farsi dire di no dalla banca.
 */
describe('quando si puo’ chiamare la banca', () => {
  it('il primo giro schedulato della giornata passa', () => {
    expect(
      decidiAccesso({ origine: 'schedulata', nonPresidiatiIn24Ore: 0, scarichiRecenti: 0 }),
    ).toBeNull();
  });

  it('il quarto passa, il quinto no', () => {
    // Al momento della decisione il quarto giro non si e' ancora contato: ne
    // vede tre. E' l'errore da non fare — un `<=` qui vale la quinta lettura.
    expect(
      decidiAccesso({ origine: 'schedulata', nonPresidiatiIn24Ore: 3, scarichiRecenti: 0 }),
    ).toBeNull();
    expect(
      decidiAccesso({ origine: 'schedulata', nonPresidiatiIn24Ore: 4, scarichiRecenti: 0 }),
    ).toContain('Tetto PSD2');
  });

  it('a tetto pieno l’apertura dell’app scarica lo stesso', () => {
    // E' il punto di tutto: il cliente e' presente, quindi non conta nel tetto.
    // Senza questo, aprire l'app dopo le quattro letture non porterebbe niente
    // — cioe' proprio nel momento in cui si sta guardando.
    expect(
      decidiAccesso({ origine: 'apertura', nonPresidiatiIn24Ore: 12, scarichiRecenti: 0 }),
    ).toBeNull();
  });

  it('ma non due volte in dieci minuti', () => {
    expect(
      decidiAccesso({ origine: 'apertura', nonPresidiatiIn24Ore: 0, scarichiRecenti: 1 }),
    ).toContain('meno di 10 minuti fa');
  });

  it('il riposo dell’apertura non frena il giro schedulato', () => {
    // Sono due domande diverse: una e' «vale la pena», l'altra e' «si puo’».
    expect(
      decidiAccesso({ origine: 'schedulata', nonPresidiatiIn24Ore: 0, scarichiRecenti: 5 }),
    ).toBeNull();
  });
});
