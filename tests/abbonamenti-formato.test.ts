import { describe, expect, it } from 'vitest';
import {
  formattaEuro,
  giorniDaOggi,
  ordinaPerPeso,
  sommaCosti,
  totalePerTipo,
} from '@/lib/abbonamenti/formato';

describe('sommaCosti', () => {
  it('somma stringhe decimali senza passare da float', () => {
    // 0.1 + 0.2 in float non fa 0.3. In centesimi fa 30, sempre.
    expect(sommaCosti(['-0.10', '-0.20']).totale).toBe(-30n);
  });

  it('conta quello che non ha saputo leggere invece di contarlo zero', () => {
    // PostgREST serializza `numeric` come numero JSON: senza `::text` nella
    // query arriva un float, e vale la pena accorgersene.
    const { totale, nonLetti } = sommaCosti(['-9.99', -14.9, null, '-5.00']);
    expect(totale).toBe(-1499n);
    expect(nonLetti).toBe(2);
  });

  it('su nessun valore restituisce zero, non NaN', () => {
    expect(sommaCosti([])).toEqual({ totale: 0n, nonLetti: 0 });
  });
});

describe('formattaEuro', () => {
  it('mette il separatore delle migliaia e la virgola dei decimali', () => {
    expect(formattaEuro(123456n)).toBe('1.234,56 €');
    expect(formattaEuro(100n)).toBe('1,00 €');
    expect(formattaEuro(0n)).toBe('0,00 €');
  });

  it('le uscite restano negative', () => {
    expect(formattaEuro(-999n)).toBe('−9,99 €');
    expect(formattaEuro(-18700n)).toBe('−187,00 €');
  });

  it('non perde precisione su importi grandi', () => {
    // Oltre 2^53 centesimi un float avrebbe gia' smesso di contare.
    expect(formattaEuro(9_007_199_254_740_993n)).toBe('90.071.992.547.409,93 €');
  });
});

describe('giorniDaOggi', () => {
  it('conta giorni civili, non ore', () => {
    expect(giorniDaOggi('2026-08-21', '2026-08-12')).toBe(9);
    expect(giorniDaOggi('2026-08-12', '2026-08-12')).toBe(0);
  });

  it('un addebito atteso ieri e’ in ritardo, quindi negativo', () => {
    expect(giorniDaOggi('2026-08-11', '2026-08-12')).toBe(-1);
  });

  it('l’ora legale non sposta il conteggio', () => {
    // 25 ottobre 2026: in Italia le lancette tornano indietro, e una
    // sottrazione fatta in ora locale darebbe 0,96 giorni invece di 1.
    expect(giorniDaOggi('2026-10-26', '2026-10-25')).toBe(1);
    expect(giorniDaOggi('2027-03-29', '2027-03-28')).toBe(1);
  });

  it('su una data che non e’ una data risponde null', () => {
    expect(giorniDaOggi('mai', '2026-08-12')).toBeNull();
  });
});

describe('ordinaPerPeso', () => {
  it('mette per prima la classe che costa di piu’', () => {
    const righe = ordinaPerPeso([
      {
        tipo: 'abbonamento',
        discrezionalita: 'utile',
        classe_nome: 'Utile',
        nel_ricorrente: true,
        contesto: 'business',
        ricorrenze: 4,
        costo_mensile: '-18.24',
      },
      {
        tipo: 'abbonamento',
        discrezionalita: 'voluttuario',
        classe_nome: 'Voluttuario',
        nel_ricorrente: true,
        contesto: 'personale',
        ricorrenze: 2,
        costo_mensile: '-187.00',
      },
    ]);
    expect(righe[0]?.discrezionalita).toBe('voluttuario');
    expect(righe[0]?.costoMensile).toBe(-18700n);
  });

  it('una riga senza costo vale zero e non rompe l’ordinamento', () => {
    const righe = ordinaPerPeso([
      {
        tipo: 'abitudine',
        discrezionalita: 'essenziale',
        classe_nome: 'Essenziale',
        nel_ricorrente: true,
        contesto: 'personale',
        ricorrenze: 1,
        costo_mensile: null,
      },
      {
        tipo: 'abbonamento',
        discrezionalita: 'utile',
        classe_nome: 'Utile',
        nel_ricorrente: true,
        contesto: 'business',
        ricorrenze: 1,
        costo_mensile: '-5.00',
      },
    ]);
    expect(righe.map((r) => r.discrezionalita)).toEqual(['utile', 'essenziale']);
  });
});

describe('totalePerTipo — i due numeri non si sommano fra loro', () => {
  const voci = ordinaPerPeso([
    {
      tipo: 'abbonamento',
      discrezionalita: 'utile',
      classe_nome: 'Utile',
      nel_ricorrente: true,
      contesto: 'business',
      ricorrenze: 2,
      costo_mensile: '-110.76',
    },
    {
      tipo: 'abbonamento',
      discrezionalita: 'voluttuario',
      classe_nome: 'Voluttuario',
      nel_ricorrente: true,
      contesto: 'personale',
      ricorrenze: 1,
      costo_mensile: '-6.99',
    },
    {
      tipo: 'abitudine',
      discrezionalita: 'essenziale',
      classe_nome: 'Essenziale',
      nel_ricorrente: true,
      contesto: 'personale',
      ricorrenze: 1,
      costo_mensile: '-47.08',
    },
  ]);

  it('somma solo dentro il proprio tipo', () => {
    expect(totalePerTipo(voci, 'abbonamento')).toBe(-11775n);
    expect(totalePerTipo(voci, 'abitudine')).toBe(-4708n);
  });

  it('un tipo che non c’e’ vale zero, non NaN', () => {
    expect(totalePerTipo(voci, 'inesistente')).toBe(0n);
  });
});
