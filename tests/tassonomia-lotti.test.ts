import { describe, expect, it } from 'vitest';
import { aLotti, IDS_PER_CHIAMATA, type Gruppo } from '@/lib/tassonomia/applica';

/**
 * `aLotti` decide come spezzare le assegnazioni fra piu' chiamate. Sbagliata
 * non da' errore: perde un gruppo, o ne consegna uno due volte, e il risultato
 * e' una classificazione plausibile e incompleta — che si nota molto dopo di
 * quanto si creda.
 *
 * L'invariante che conta e' uno solo: **ogni identificativo esce esattamente
 * una volta**, con la sua assegnazione.
 */

function gruppo(merchant: string, quanti: number): Gruppo {
  return {
    merchant_id: merchant,
    category_id: `cat-${merchant}`,
    discretion: 'voluttuario',
    context: 'personale',
    ids: Array.from({ length: quanti }, (_, i) => `${merchant}-${i}`),
  };
}

function raccogli(gruppi: readonly Gruppo[], daSvuotare: readonly string[]) {
  const lotti = [...aLotti(gruppi, daSvuotare)];
  return {
    lotti,
    assegnati: lotti.flatMap((l) => l.gruppi.flatMap((g) => g.ids)),
    svuotati: lotti.flatMap((l) => l.daSvuotare),
  };
}

describe('aLotti', () => {
  it('consegna ogni identificativo una volta sola', () => {
    const gruppi = [gruppo('a', 3), gruppo('b', 2), gruppo('c', 1)];
    const { assegnati } = raccogli(gruppi, ['x', 'y']);

    expect(assegnati).toHaveLength(6);
    expect(new Set(assegnati).size).toBe(6);
  });

  it('tiene insieme un gruppo con la sua assegnazione', () => {
    const { lotti } = raccogli([gruppo('a', 2)], []);
    const consegnato = lotti.flatMap((l) => l.gruppi);

    expect(consegnato).toHaveLength(1);
    expect(consegnato[0]?.category_id).toBe('cat-a');
    expect(consegnato[0]?.ids).toEqual(['a-0', 'a-1']);
  });

  it('sotto la soglia sta tutto in una chiamata', () => {
    const { lotti } = raccogli([gruppo('a', 10), gruppo('b', 10)], []);
    expect(lotti.filter((l) => l.gruppi.length > 0)).toHaveLength(1);
  });

  it('sopra la soglia spezza, senza perdere niente', () => {
    const gruppi = [gruppo('a', IDS_PER_CHIAMATA), gruppo('b', 5)];
    const { lotti, assegnati } = raccogli(gruppi, []);

    expect(lotti.filter((l) => l.gruppi.length > 0).length).toBeGreaterThan(1);
    expect(assegnati).toHaveLength(IDS_PER_CHIAMATA + 5);
    expect(new Set(assegnati).size).toBe(IDS_PER_CHIAMATA + 5);
  });

  it('un singolo gruppo piu grosso della soglia esce comunque intero', () => {
    // Non lo spezza a meta': meglio un corpo grosso una volta che un gruppo
    // consegnato in due pezzi, che renderebbe illeggibili i due contatori.
    const { assegnati } = raccogli([gruppo('a', IDS_PER_CHIAMATA * 2)], []);
    expect(assegnati).toHaveLength(IDS_PER_CHIAMATA * 2);
  });

  it('spezza anche gli svuotamenti', () => {
    const daSvuotare = Array.from({ length: IDS_PER_CHIAMATA + 7 }, (_, i) => `s-${i}`);
    const { lotti, svuotati } = raccogli([], daSvuotare);

    expect(svuotati).toEqual(daSvuotare);
    expect(lotti.filter((l) => l.daSvuotare.length > 0)).toHaveLength(2);
  });

  it('senza niente da fare chiama comunque una volta', () => {
    // Cosi' il resoconto dice `0` invece di non dire niente: un giro che non
    // riporta nulla e uno che non e' stato eseguito devono restare distinti.
    const { lotti } = raccogli([], []);
    expect(lotti).toEqual([{ gruppi: [], daSvuotare: [] }]);
  });
});
