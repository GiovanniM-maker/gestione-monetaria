import { describe, expect, it } from 'vitest';
import { STRUMENTI, strumento } from '@/lib/copilota/strumenti';
import { ANONIMO, sanificaMetriche } from '@/lib/report/sanifica';

/**
 * Il catalogo si prova per quello che può rompersi in silenzio.
 *
 * Chiamare gli strumenti richiederebbe il database, e provare che
 * `spesa_per_categoria` somma bene è già provato dove la somma sta davvero,
 * cioè in SQL. Quello che si può rompere qui è il **contratto**: un nome
 * duplicato, uno schema che il modello non sa leggere, e soprattutto il nome
 * del campo su cui poggia la regola 8.
 */

describe('il contratto degli strumenti', () => {
  it('non ha due operazioni con lo stesso nome', () => {
    const nomi = STRUMENTI.map((s) => s.nome);
    expect(new Set(nomi).size).toBe(nomi.length);
  });

  it('dichiara ogni parametro come un oggetto JSON Schema', () => {
    for (const s of STRUMENTI) {
      expect(s.parametri['type'], s.nome).toBe('object');
      expect(typeof s.parametri['properties'], s.nome).toBe('object');
      expect(s.descrizione.length, s.nome).toBeGreaterThan(20);
    }
  });

  it('si trova per nome, e un nome inventato non trova niente', () => {
    expect(strumento('costo_ricorrente')?.nome).toBe('costo_ricorrente');
    expect(strumento('cancella_tutto')).toBeUndefined();
  });

  it('espone tre sole scritture, e nessuna che cancelli', () => {
    const scritture = STRUMENTI.filter((s) =>
      ['correggi_movimento', 'aggiorna_esercente', 'crea_categoria'].includes(s.nome),
    );
    expect(scritture).toHaveLength(3);
    expect(STRUMENTI.some((s) => /elimin|cancell|svuot/i.test(s.nome))).toBe(false);
  });
});

describe('la regola 8 sul risultato di uno strumento', () => {
  /**
   * La forma vera restituita da `cerca_movimenti`. Il campo del nome si chiama
   * `esercente` **perché** è quella la chiave che il filtro conosce:
   * rinominarlo `nome` o `merchant` lo scavalcherebbe senza rompere niente, ed
   * è esattamente il modo in cui una difesa smette di funzionare in silenzio.
   */
  const risultato = {
    totale_righe: 3,
    totale_importo: '-1240.00',
    movimenti: [
      { id: 'a', data: '2026-07-03', importo: '-42.00', esercente: 'Deliveroo' },
      { id: 'b', data: '2026-07-04', importo: '-500.00', esercente: 'Massimiliano De Jesus Sarta' },
      { id: 'c', data: '2026-07-05', importo: '-698.00', esercente: 'Comet Spa' },
    ],
  };

  it('lascia passare le attività e sostituisce le persone', () => {
    const { metriche, anonimizzati } = sanificaMetriche(risultato);
    const nomi = (metriche as typeof risultato).movimenti.map((m) => m.esercente);

    expect(nomi).toEqual(['Deliveroo', ANONIMO, 'Comet Spa']);
    expect(anonimizzati).toBe(1);
  });

  it('non tocca gli importi né gli identificativi', () => {
    const { metriche } = sanificaMetriche(risultato);
    const dopo = metriche as typeof risultato;

    expect(dopo.totale_importo).toBe('-1240.00');
    expect(dopo.movimenti.map((m) => m.importo)).toEqual(['-42.00', '-500.00', '-698.00']);
    expect(dopo.movimenti.map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });
});
