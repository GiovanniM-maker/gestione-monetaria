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

  /**
   * Le scritture sono poche e si contano.
   *
   * Il test originale diceva «tre, e nessuna che cancelli». Le tre sono
   * diventate sette con le classi modificabili, e una di quelle **cancella**:
   * `elimina_classe`. Non e' un cedimento della regola, e' il motivo per cui
   * quella regola era scritta male — quello che protegge non e' il nome
   * dell'operazione, e' che ogni scrittura sia una **proposta** che l'utente
   * applica con un tocco, e che `elimina_classe` pretenda di dire dove vanno
   * le righe invece di lasciarle senza classe.
   *
   * Quello che il test difende resta: aggiungere una scrittura dev'essere un
   * atto deliberato, non una cosa che capita.
   */
  const SCRITTURE = [
    'correggi_movimento',
    'aggiorna_esercente',
    'crea_categoria',
    'sposta_movimento',
    'crea_classe',
    'aggiorna_classe',
    'elimina_classe',
  ];

  it('espone esattamente le scritture previste, e nessun’altra', () => {
    const scritture = STRUMENTI.filter((s) => SCRITTURE.includes(s.nome));
    expect(scritture).toHaveLength(SCRITTURE.length);
  });

  it('l’unica operazione che cancella e’ quella sulle classi', () => {
    const distruttive = STRUMENTI.filter((s) => /elimin|cancell|svuot/i.test(s.nome)).map(
      (s) => s.nome,
    );
    expect(distruttive).toEqual(['elimina_classe']);
  });

  it('eliminare una classe sa dire dove vanno le sue righe', () => {
    // Senza destinazione l'unica alternativa sarebbe metterle a `null`, cioe'
    // spostare della spesa classificata dentro «non classificato» in silenzio.
    const s = strumento('elimina_classe');
    expect(Object.keys(s?.parametri['properties'] as object)).toContain('verso');
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
