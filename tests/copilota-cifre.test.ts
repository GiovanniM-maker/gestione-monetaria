import { describe, expect, it } from 'vitest';
import { cifreInventate, cifreScritte, letture } from '@/lib/copilota/cifre';

/**
 * Il controllo delle cifre è l'unica difesa contro un modello che calcola che
 * non dipenda dalla sua buona volontà. Deve prendere il numero inventato e
 * tacere su tutto il resto: un avviso che compare sempre non lo legge nessuno,
 * e a quel punto non protegge più niente.
 */

describe('letture di un token numerico', () => {
  it('legge il separatore decimale italiano e quello inglese', () => {
    expect(letture('6,99')).toEqual(['6.99']);
    expect(letture('6.99')).toEqual(['6.99']);
  });

  it('con due tipi di separatore, il decimale è l’ultimo', () => {
    expect(letture('3.640,32')).toEqual(['3640.32']);
    expect(letture('3,640.32')).toEqual(['3640.32']);
  });

  it('lo stesso separatore ripetuto può solo separare le migliaia', () => {
    expect(letture('1.234.567')).toEqual(['1234567']);
  });

  it('un separatore solo con tre cifre dopo resta ambiguo, e valgono entrambe', () => {
    expect(letture('1.234')).toEqual(['1234', '1.234']);
  });

  it('butta il segno e gli zeri inutili: il confronto è sul valore', () => {
    expect(letture('-3640.32')).toEqual(['3640.32']);
    expect(letture('007')).toEqual(['7']);
  });

  it('nel dubbio aggiunge una lettura invece di toglierne una', () => {
    // `-3640.320` ha tre cifre dopo il punto, quindi è ambiguo come `1.234`:
    // si tengono entrambe le letture. Una lettura in più può solo far tacere
    // il controllo su una cifra vera, mai farlo gridare su una inventata — ed
    // è il verso giusto in cui sbagliare per un avviso che deve restare raro.
    expect(letture('-3640.320')).toContain('3640.32');
  });
});

describe('quali cifre si controllano', () => {
  const testi = (s: string) => cifreScritte(s).map((c) => c.testo);

  it('controlla gli importi, che sono le cifre che portano una decisione', () => {
    expect(testi('Hai speso 3.640,32 € a luglio')).toEqual(['3.640,32 €']);
    expect(testi('Netflix costa 6,99 al mese')).toEqual(['6,99']);
  });

  it('controlla le percentuali: nei dati non ce ne sono quasi mai', () => {
    expect(testi('è il 42% del totale')).toEqual(['42%']);
  });

  it('non controlla i conteggi piccoli: contare un elenco ricevuto è lecito', () => {
    expect(testi('due o tre voci, 59 ordini, negli ultimi 6 mesi')).toEqual([]);
  });

  it('non scambia una data per una cifra', () => {
    expect(testi('fra il 2026-07-01 e il 31/07/2026')).toEqual([]);
  });
});

describe('cifre inventate', () => {
  const dati = {
    mesi: [
      { mese: '2026-07-01', spesa: '-3640.32', movimenti: 132 },
      { mese: '2026-06-01', spesa: '-2959.24', movimenti: 118 },
    ],
    ricorrente: [{ tipo: 'abbonamento', costo_mensile: '-425.96' }],
  };

  it('tace quando ogni cifra viene dai dati', () => {
    expect(cifreInventate('A luglio hai speso **3.640,32 €** su 132 movimenti.', dati)).toEqual([]);
  });

  it('accetta il segno rovesciato: in italiano una spesa si dice positiva', () => {
    expect(cifreInventate('Hai speso 3640.32 €', dati)).toEqual([]);
  });

  it('accetta un arrotondamento per leggibilità', () => {
    expect(cifreInventate('circa 3.640 €', dati)).toEqual([]);
    expect(cifreInventate('circa 2.959,2 €', dati)).toEqual([]);
  });

  it('prende la differenza calcolata, che è il caso per cui esiste', () => {
    // 3640.32 - 2959.24 = 681.08, e nei dati non c'è.
    expect(cifreInventate('Hai speso 681,08 € in più di giugno.', dati)).toEqual(['681,08 €']);
  });

  it('prende la percentuale calcolata', () => {
    expect(cifreInventate('Gli abbonamenti sono il 11,7% della spesa.', dati)).toEqual(['11,7%']);
  });

  it('prende un importo di sana pianta', () => {
    expect(cifreInventate('Netflix ti costa **12,99 €** al mese.', dati)).toEqual(['12,99 €']);
  });

  it('non si lascia ingannare dal numero scritto in un altro formato', () => {
    expect(cifreInventate('spesa di 425,96 € in abbonamenti', dati)).toEqual([]);
  });
});
