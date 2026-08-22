import { describe, expect, it } from 'vitest';
import { ritornoSicuro, CASA } from '@/lib/auth/ritorno';

/**
 * Il percorso di ritorno arriva da un parametro dell'indirizzo, cioe' da
 * qualcosa che chiunque puo' scrivere. L'invariante e' uno: **non deve mai
 * poter portare fuori da qui**.
 */
describe('ritornoSicuro', () => {
  it('accetta un percorso interno, con la sua query', () => {
    expect(ritornoSicuro('/movimenti')).toBe('/movimenti');
    expect(ritornoSicuro('/dove?mese=2026-07')).toBe('/dove?mese=2026-07');
    expect(ritornoSicuro('/esercente/abc-123')).toBe('/esercente/abc-123');
  });

  it('rifiuta tutto cio che porta fuori', () => {
    for (const cattivo of [
      '//esempio.invalido',
      'https://esempio.invalido',
      'http://esempio.invalido',
      '/\\esempio.invalido',
      'esempio.invalido',
      '',
      '   ',
    ]) {
      expect(ritornoSicuro(cattivo)).toBe(CASA);
    }
  });

  it('rifiuta cio che non e una stringa', () => {
    for (const strano of [null, undefined, 42, {}, ['/movimenti']]) {
      expect(ritornoSicuro(strano)).toBe(CASA);
    }
  });

  it('non riporta al login: sarebbe un anello', () => {
    expect(ritornoSicuro('/login')).toBe(CASA);
    expect(ritornoSicuro('/login?ritorno=%2Fmovimenti')).toBe(CASA);
  });

  it('rifiuta i caratteri di controllo', () => {
    // Possono spezzare l'intestazione `Location` e farne nascere una seconda.
    expect(ritornoSicuro('/movimenti\nLocation: https://esempio.invalido')).toBe(CASA);
    expect(ritornoSicuro('/movimenti\r\nSet-Cookie: x=1')).toBe(CASA);
  });
});
