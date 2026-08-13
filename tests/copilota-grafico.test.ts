import { describe, expect, it } from 'vitest';
import { ALTEZZA, LARGHEZZA, disegna, larghezzaBarra, spezzata } from '@/lib/copilota/grafico';
import type { Grafico } from '@/lib/copilota/messaggi';

/**
 * La scala di un grafico è l'unico pezzo che possa sbagliare in modo
 * silenzioso: una figura mal scalata è *plausibile* e falsa, ed è la stessa
 * categoria di errore che il resto dell'applicazione combatte sui numeri.
 */

function grafico(valori: readonly string[], tipo: 'linee' | 'barre' = 'linee'): Grafico {
  return {
    titolo: 'prova',
    tipo,
    serie: [
      {
        nome: 'spesa',
        punti: valori.map((v, i) => ({ etichetta: `m${i}`, valore: v })),
      },
    ],
  };
}

describe('lo zero sta sempre nel dominio', () => {
  it('una variazione piccola resta piccola', () => {
    // -3000 e -3090 differiscono del 3%. Se la scala partisse dal minimo
    // osservato riempirebbero tutta l'altezza e si leggerebbero come un crollo.
    const d = disegna(grafico(['-3000.00', '-3090.00']));
    const punti = d!.serie[0]!.punti;
    const distanza = Math.abs(punti[0]!.y - punti[1]!.y);
    expect(distanza).toBeLessThan(d!.altezza * 0.1);
  });

  it('lo zero è dentro il disegno anche con soli valori negativi', () => {
    const d = disegna(grafico(['-100.00', '-500.00', '-300.00']))!;
    expect(d.zeroY).toBeGreaterThanOrEqual(0);
    expect(d.zeroY).toBeLessThanOrEqual(ALTEZZA);
  });

  it('più si spende, più in basso va il punto', () => {
    const d = disegna(grafico(['-100.00', '-500.00']))!;
    const [poco, molto] = d.serie[0]!.punti;
    expect(molto!.y).toBeGreaterThan(poco!.y);
  });
});

describe('gli importi non passano da un float', () => {
  it('formatta il valore esatto, centesimi compresi', () => {
    const d = disegna(grafico(['-3640.32', '-2959.24']))!;
    expect(d.serie[0]!.punti.map((p) => p.testo)).toEqual(['−3.640,32 €', '−2.959,24 €']);
    expect(d.serie[0]!.punti[0]!.centesimi).toBe(-364032n);
  });

  it('un importo illeggibile non diventa zero: sparisce e viene contato', () => {
    // Uno zero silenzioso in un grafico di spese è esattamente il tipo di
    // errore che sembra un dato.
    const d = disegna(grafico(['-100.00', 'boh', '-300.00']))!;
    expect(d.serie[0]!.punti).toHaveLength(2);
    expect(d.nonLetti).toBe(1);
  });
});

describe('quando non c’è niente da disegnare', () => {
  it('un punto solo non è un grafico', () => {
    expect(disegna(grafico(['-100.00']))).toBeNull();
  });

  it('nessun punto leggibile non è un grafico', () => {
    expect(disegna(grafico(['boh', 'niente']))).toBeNull();
  });

  it('una serie tutta a zero non divide per zero', () => {
    const d = disegna(grafico(['0.00', '0.00', '0.00']))!;
    for (const p of d.serie[0]!.punti) expect(Number.isFinite(p.y)).toBe(true);
  });
});

describe('la forma sta dentro il riquadro', () => {
  it('nessun punto esce dal viewBox', () => {
    const d = disegna(grafico(['-3640.32', '1500.00', '-200.00', '0.00']))!;
    for (const p of d.serie[0]!.punti) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(LARGHEZZA);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(ALTEZZA);
    }
  });

  it('le barre non si sovrappongono', () => {
    const d = disegna(grafico(['-1.00', '-2.00', '-3.00', '-4.00'], 'barre'))!;
    const punti = d.serie[0]!.punti;
    const passo = punti[1]!.x - punti[0]!.x;
    expect(larghezzaBarra(punti.length)).toBeLessThan(passo);
  });

  it('al massimo tre etichette sulle ascisse, anche con dodici mesi', () => {
    const d = disegna(grafico(Array.from({ length: 12 }, (_, i) => `-${i + 1}00.00`)))!;
    expect(d.etichetteX.length).toBeLessThanOrEqual(3);
    expect(d.etichetteX[0]!.testo).toBe('m0');
    expect(d.etichetteX.at(-1)!.testo).toBe('m11');
  });

  it('la spezzata è una lista di coordinate, non di importi', () => {
    const d = disegna(grafico(['-100.00', '-200.00']))!;
    expect(spezzata(d.serie[0]!.punti)).toMatch(/^[\d.]+,[\d.]+ [\d.]+,[\d.]+$/);
  });
});

describe('due serie', () => {
  it('condividono la stessa scala, o il confronto non vuol dire niente', () => {
    const d = disegna({
      titolo: 'entrate e spesa',
      tipo: 'linee',
      serie: [
        {
          nome: 'entrate',
          punti: [
            { etichetta: 'a', valore: '3000.00' },
            { etichetta: 'b', valore: '3000.00' },
          ],
        },
        {
          nome: 'spesa',
          punti: [
            { etichetta: 'a', valore: '-3000.00' },
            { etichetta: 'b', valore: '-3000.00' },
          ],
        },
      ],
    })!;
    const entrate = d.serie[0]!.punti[0]!;
    const spesa = d.serie[1]!.punti[0]!;
    // Simmetriche rispetto allo zero, perché valgono lo stesso in segno opposto.
    expect(Math.abs(d.zeroY - entrate.y)).toBeCloseTo(Math.abs(spesa.y - d.zeroY), 1);
  });
});
