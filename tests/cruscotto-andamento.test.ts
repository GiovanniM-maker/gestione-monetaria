import { describe, expect, it } from 'vitest';
import {
  comeSiConfronta,
  percentualeIntera,
  segnoDi,
  type Variazione,
} from '@/lib/cruscotto/andamento';

/**
 * Il segno accanto a una riga del cruscotto.
 *
 * Il caso che questi test proteggono e' uno solo, e vale la schermata intera:
 * **spendere di piu' deve puntare in su.** Le uscite sono negative, quindi la
 * tentazione di leggere «−600 e' minore di −500, quindi e' sceso» e'
 * permanente. La divisione la fa SQL (`0036`), qui si controlla che il simbolo
 * segua il giudizio che SQL ha dato e non il segno dell'importo.
 */

function riga(parti: Partial<Variazione>): Variazione {
  return {
    spesa: '-600.00',
    tipico: '-500.00',
    variazione_pct: '20.0',
    andamento: 'su',
    movimenti: 3,
    mesi_di_confronto: 6,
    giorni_confrontati: null,
    ...parti,
  };
}

describe('segnoDi', () => {
  it('spendere di piu" punta in su, anche se l importo e" piu" negativo', () => {
    const s = segnoDi(riga({ spesa: '-600.00', tipico: '-500.00', andamento: 'su' }));
    expect(s?.simbolo).toBe('▲');
    expect(s?.testo).toBe('+20%');
    expect(s?.tono).toBe('su');
  });

  it('spendere di meno punta in giu", col suo segno', () => {
    const s = segnoDi(riga({ andamento: 'giu', variazione_pct: '-40.0' }));
    expect(s?.simbolo).toBe('▼');
    expect(s?.testo).toBe('-40%');
    expect(s?.tono).toBe('giu');
  });

  it('sotto il 5% e" stabile, e il tono e" neutro', () => {
    const s = segnoDi(riga({ andamento: 'stabile', variazione_pct: '2.0' }));
    expect(s?.simbolo).toBe('▬');
    expect(s?.testo).toBe('+2%');
    expect(s?.tono).toBe('neutro');
  });

  it('«nuovo» non e" «su»: senza un prima non c e" una percentuale', () => {
    const s = segnoDi(riga({ andamento: 'nuovo', tipico: null, variazione_pct: null }));
    expect(s?.testo).toBe('nuovo');
    expect(s?.simbolo).toBe('·');
    expect(s?.tono).toBe('neutro');
  });

  it('un andamento che non riconosciamo non diventa una freccia a caso', () => {
    expect(segnoDi(riga({ andamento: 'boh' }))).toBeNull();
    expect(segnoDi(riga({ andamento: '' }))).toBeNull();
  });

  it('senza percentuale mostra comunque la direzione, senza inventare una cifra', () => {
    const s = segnoDi(riga({ andamento: 'su', variazione_pct: null }));
    expect(s?.simbolo).toBe('▲');
    expect(s?.testo).toBe('');
    expect(s?.descrizione).toContain('più');
  });
});

describe('percentualeIntera', () => {
  it('arrotonda al punto percentuale', () => {
    expect(percentualeIntera('20.0')).toBe(20);
    expect(percentualeIntera('-10.3')).toBe(-10);
    expect(percentualeIntera('28.6')).toBe(29);
  });

  it('su un valore illeggibile risponde null invece di NaN', () => {
    expect(percentualeIntera(null)).toBeNull();
    expect(percentualeIntera('boh')).toBeNull();
  });
});

describe('comeSiConfronta', () => {
  it('dice quanti giorni, quando la finestra e" parziale', () => {
    expect(comeSiConfronta(riga({ giorni_confrontati: 13, mesi_di_confronto: 6 }))).toBe(
      'Confronto sui primi 13 giorni, contro gli stessi giorni del mese tipico dei 6 mesi precedenti.',
    );
  });

  it('su un mese chiuso dice che sono interi', () => {
    expect(comeSiConfronta(riga({ giorni_confrontati: null }))).toContain('interi');
  });

  it('senza mesi da confrontare non dice niente', () => {
    expect(comeSiConfronta(riga({ mesi_di_confronto: 0 }))).toBeNull();
    expect(comeSiConfronta(undefined)).toBeNull();
  });
});

/**
 * Il caso trovato sui dati veri, il 14 agosto 2026.
 *
 * `investimento / personale` a zero contro un tipico di 500 € — ma quel 500 è
 * la mediana di **due mesi su sei**. Il `−100%` è aritmeticamente vero e come
 * informazione è fuorviante: non è una spesa crollata, è una spesa che non
 * capita tutti i mesi. È la stessa lezione della Fase 5, dove estrapolare da
 * una mediana su una serie rada dichiarava 8.966 €/mese di spesa inesistente.
 */
describe('confronti su pochi mesi', () => {
  it('due mesi su sei: la freccia resta, il tono no', () => {
    const s = segnoDi(
      riga({
        spesa: '0',
        tipico: '-500.00',
        variazione_pct: '-100.0',
        andamento: 'giu',
        mesi_di_confronto: 2,
      }),
    );
    expect(s?.testo).toBe('-100%');
    expect(s?.parziale).toBe(true);
    expect(s?.tono).toBe('neutro');
    expect(s?.descrizione).toContain('2 mesi su 6');
  });

  it('sei mesi su sei: il tono resta quello della spesa', () => {
    const s = segnoDi(riga({ mesi_di_confronto: 6 }));
    expect(s?.parziale).toBe(false);
    expect(s?.tono).toBe('su');
    expect(s?.descrizione).not.toContain('su 6 in cui');
  });

  it('la metà esatta non è «pochi»: tre mesi su sei bastano', () => {
    expect(segnoDi(riga({ mesi_di_confronto: 3 }))?.parziale).toBe(false);
    expect(segnoDi(riga({ mesi_di_confronto: 2 }))?.parziale).toBe(true);
  });

  it('«nuovo» non è mai parziale: lì il confronto non c’è proprio', () => {
    const s = segnoDi(
      riga({ andamento: 'nuovo', tipico: null, variazione_pct: null, mesi_di_confronto: 0 }),
    );
    expect(s?.parziale).toBe(false);
    expect(s?.testo).toBe('nuovo');
  });
});
