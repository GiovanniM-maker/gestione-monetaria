import { describe, expect, it } from 'vitest';
import { ANONIMO, sanificaMetriche } from '@/lib/report/sanifica';

/**
 * La regola 8 vale anche — anzi soprattutto — quando i nomi escono per essere
 * raccontati invece che classificati.
 */

describe('sanificaMetriche', () => {
  it('lascia passare gli esercenti che dichiarano un’attività', () => {
    const { metriche, anonimizzati } = sanificaMetriche({
      esercenti: [{ esercente: 'Deliveroo', spesa: '-129.76' }],
    });
    expect(metriche).toEqual({ esercenti: [{ esercente: 'Deliveroo', spesa: '-129.76' }] });
    expect(anonimizzati).toBe(0);
  });

  it('sostituisce i nomi di persona, ovunque siano', () => {
    // Sono esercenti veri del database: controparti di bonifici privati che la
    // Fase 4 ha registrato come esercenti, perché a un pagamento ricorrente
    // serve un nome.
    const { metriche, anonimizzati } = sanificaMetriche({
      esercenti: [
        { esercente: 'Sabrina Di Javadzade', spesa: '-100.02' },
        { esercente: 'Coop', spesa: '-229.75' },
      ],
      avvisi_aperti: [{ tipo: 'price_increase', esercente: 'Cavallo Vincenzo' }],
    });

    expect(metriche).toEqual({
      esercenti: [
        { esercente: ANONIMO, spesa: '-100.02' },
        { esercente: 'Coop', spesa: '-229.75' },
      ],
      avvisi_aperti: [{ tipo: 'price_increase', esercente: ANONIMO }],
    });
    expect(anonimizzati).toBe(2);
  });

  it('gli importi non si toccano: sparisce il nome, non il numero', () => {
    const { metriche } = sanificaMetriche({
      esercenti: [{ esercente: 'Laura Bovi', spesa: '-25.22', movimenti: 6 }],
    });
    expect(metriche).toEqual({
      esercenti: [{ esercente: ANONIMO, spesa: '-25.22', movimenti: 6 }],
    });
  });

  it('le categorie non sono controparti e restano intatte', () => {
    const { metriche, anonimizzati } = sanificaMetriche({
      categorie: [{ categoria: 'Bar e caffetterie', spesa: '-48.60' }],
    });
    expect(metriche).toEqual({ categorie: [{ categoria: 'Bar e caffetterie', spesa: '-48.60' }] });
    expect(anonimizzati).toBe(0);
  });

  it('un esercente nullo non diventa «un privato»', () => {
    // `null` non è un nome trattenuto: è l'assenza di un nome, e sostituirlo
    // inventerebbe una controparte che non esiste.
    const { metriche, anonimizzati } = sanificaMetriche({
      avvisi_aperti: [{ tipo: 'sync_failed', esercente: null }],
    });
    expect(metriche).toEqual({ avvisi_aperti: [{ tipo: 'sync_failed', esercente: null }] });
    expect(anonimizzati).toBe(0);
  });

  it('cammina anche le strutture annidate che oggi non esistono', () => {
    // La sanificazione non conosce la forma delle metriche: una chiave
    // aggiunta domani è coperta da subito, mentre un elenco di percorsi da
    // ripulire andrebbe aggiornato a mano — e il giorno che ci si dimentica
    // è il giorno della fuga.
    const { metriche } = sanificaMetriche({
      a: { b: { c: [{ esercente: 'Vincenzo Mavilla' }] } },
    });
    expect(metriche).toEqual({ a: { b: { c: [{ esercente: ANONIMO }] } } });
  });
});
