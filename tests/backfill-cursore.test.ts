import { describe, expect, it } from 'vitest';
import { avanzaCursore, backfillCompletato } from '@/lib/sync/backfill';
import { canonicalJson, payloadHash } from '@/lib/sync/hash';
import type { BackfillCursor } from '@/lib/db/types';

const base: BackfillCursor = {
  dateFrom: '2024-08-01',
  dateTo: '2026-08-01',
  pending: ['conto-b', 'conto-c'],
  current: 'conto-a',
  continuationKey: null,
  completed: [],
};

describe('avanzaCursore', () => {
  it('resta sullo stesso conto finche arriva una continuation key', () => {
    const dopo = avanzaCursore(base, 'chiave-pagina-2');
    expect(dopo.current).toBe('conto-a');
    expect(dopo.continuationKey).toBe('chiave-pagina-2');
    expect(dopo.completed).toEqual([]);
    expect(dopo.pending).toEqual(['conto-b', 'conto-c']);
  });

  it('chiude il conto quando la continuation key sparisce', () => {
    const dopo = avanzaCursore({ ...base, continuationKey: 'chiave-pagina-2' }, null);
    expect(dopo.current).toBeNull();
    expect(dopo.continuationKey).toBeNull();
    expect(dopo.completed).toEqual(['conto-a']);
  });

  it('tratta la stringa vuota come fine del conto, non come pagina successiva', () => {
    // Una continuation key vuota rimandata all'API produrrebbe un ciclo infinito
    // sulla stessa pagina, oppure un errore: va trattata come assenza.
    expect(avanzaCursore(base, '').current).toBeNull();
  });

  it('non altera un cursore senza conto in lavorazione', () => {
    const fermo: BackfillCursor = { ...base, current: null };
    expect(avanzaCursore(fermo, 'qualcosa')).toEqual(fermo);
  });
});

describe('backfillCompletato', () => {
  it('e completo solo senza conto corrente e senza conti in coda', () => {
    expect(backfillCompletato({ ...base, current: null, pending: [] })).toBe(true);
    expect(backfillCompletato({ ...base, current: null })).toBe(false);
    expect(backfillCompletato({ ...base, pending: [] })).toBe(false);
  });
});

describe('canonicalJson', () => {
  it('produce la stessa stringa a prescindere dall ordine delle chiavi', () => {
    const a = { entry_reference: 'x', transaction_amount: { amount: '6.99', currency: 'EUR' } };
    const b = { transaction_amount: { currency: 'EUR', amount: '6.99' }, entry_reference: 'x' };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(payloadHash(a)).toBe(payloadHash(b));
  });

  it('distingue payload diversi', () => {
    expect(payloadHash({ status: 'PDNG' })).not.toBe(payloadHash({ status: 'BOOK' }));
  });

  it('gestisce null, array e valori annidati', () => {
    expect(canonicalJson({ a: null, b: [1, { d: 2, c: 3 }] })).toBe(
      '{"a":null,"b":[1,{"c":3,"d":2}]}',
    );
  });

  it('e stabile su due chiamate consecutive: e il presupposto della deduplicazione', () => {
    const movimento = {
      entry_reference: '0554fc6a-67f0-e349-0280-16848dd82d3d',
      transaction_amount: { currency: 'EUR', amount: '6.99' },
      credit_debit_indicator: 'DBIT',
      status: 'PDNG',
      booking_date: '2026-08-11',
      value_date: null,
    };
    expect(payloadHash(movimento)).toBe(payloadHash({ ...movimento }));
  });
});
