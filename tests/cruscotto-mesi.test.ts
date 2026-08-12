import { describe, expect, it } from 'vitest';
import {
  etichettaBreve,
  etichettaMese,
  meseDaData,
  meseValido,
  quotaPercentuale,
  spostaMese,
  variazione,
} from '@/lib/cruscotto/mesi';

describe('meseValido', () => {
  it('accetta un mese e rifiuta tutto il resto', () => {
    expect(meseValido('2026-07')).toBe('2026-07');
    expect(meseValido(' 2026-01 ')).toBe('2026-01');
    expect(meseValido('2026-13')).toBeNull();
    expect(meseValido('2026-00')).toBeNull();
    expect(meseValido('2026-7')).toBeNull();
    expect(meseValido('luglio')).toBeNull();
    expect(meseValido(undefined)).toBeNull();
    expect(meseValido(202607)).toBeNull();
  });
});

describe('meseDaData', () => {
  it('taglia la data invece di parsarla', () => {
    expect(meseDaData('2026-07-01')).toBe('2026-07');
    // Il caso che un `new Date()` sbaglierebbe: l'ultimo giorno del mese,
    // che in UTC-1 diventerebbe il mese prima.
    expect(meseDaData('2026-07-31')).toBe('2026-07');
    expect(meseDaData('2026-08-01')).toBe('2026-08');
  });

  it('su qualcosa che non e’ una data risponde null', () => {
    expect(meseDaData(null)).toBeNull();
    expect(meseDaData('mai')).toBeNull();
  });
});

describe('spostaMese', () => {
  it('scavalca il capodanno in entrambe le direzioni', () => {
    expect(spostaMese('2026-01', -1)).toBe('2025-12');
    expect(spostaMese('2025-12', 1)).toBe('2026-01');
  });

  it('sposta di piu’ mesi in un colpo', () => {
    expect(spostaMese('2026-07', -12)).toBe('2025-07');
    expect(spostaMese('2026-07', 6)).toBe('2027-01');
    expect(spostaMese('2026-07', 0)).toBe('2026-07');
  });

  it('l’ora legale non c’entra niente', () => {
    // Fine marzo e fine ottobre sono i due cambi d'ora italiani: con un `Date`
    // la sottrazione di un mese qui puo' finire nel mese sbagliato.
    expect(spostaMese('2026-03', -1)).toBe('2026-02');
    expect(spostaMese('2026-10', 1)).toBe('2026-11');
    expect(spostaMese('2026-11', -1)).toBe('2026-10');
  });

  it('su un mese non valido risponde null', () => {
    expect(spostaMese('2026-13', 1)).toBeNull();
  });
});

describe('etichette', () => {
  it('scrive il mese in italiano', () => {
    expect(etichettaMese('2026-07')).toBe('luglio 2026');
    expect(etichettaMese('2025-12')).toBe('dicembre 2025');
    expect(etichettaBreve('2026-07')).toBe('lug 26');
  });

  it('su un valore non valido restituisce l’originale invece di inventare', () => {
    expect(etichettaMese('boh')).toBe('boh');
  });
});

describe('quotaPercentuale', () => {
  it('ignora il segno: le uscite sono negative e le barre no', () => {
    expect(quotaPercentuale(-25n, -100n)).toBe(25);
    expect(quotaPercentuale(-100n, -100n)).toBe(100);
  });

  it('su un totale a zero risponde zero, non NaN', () => {
    expect(quotaPercentuale(-10n, 0n)).toBe(0);
  });

  it('non supera il 100 nemmeno se la parte e’ piu’ grande del totale', () => {
    // Puo' succedere fra viste diverse: la barra si satura invece di
    // sbordare fuori dal riquadro.
    expect(quotaPercentuale(-150n, -100n)).toBe(100);
  });

  it('regge importi enormi senza perdere il conto', () => {
    expect(quotaPercentuale(-500_000_000_000n, -1_000_000_000_000n)).toBe(50);
  });
});

describe('variazione', () => {
  it('positivo vuol dire speso di piu’', () => {
    expect(variazione(-15000n, -10000n)).toBe(50);
    expect(variazione(-5000n, -10000n)).toBe(-50);
    expect(variazione(-10000n, -10000n)).toBe(0);
  });

  it('rispetto al niente non esiste una variazione', () => {
    expect(variazione(-10000n, 0n)).toBeNull();
  });
});
