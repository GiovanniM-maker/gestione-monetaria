import { describe, expect, it } from 'vitest';
import {
  aperturaDi,
  categorieComeNodi,
  movimentiComeNodi,
  ricorrenzeComeNodi,
  rientro,
  versoMovimenti,
  type RigaRipartizione,
} from '@/lib/dove/nodi';

/**
 * Il difetto che questi test esistono per non far tornare non da' errore:
 * produce un elenco plausibile in cui **ogni euro compare due volte**.
 *
 * Succede se la riga «direttamente qui» chiede i movimenti del ramo intero
 * invece che del solo nodo, oppure se compare anche dove non serve. Nessuna
 * delle due cose si vede guardando la schermata: si vede sommando a mano, cioe'
 * settimane dopo.
 */

const riga = (v: Partial<RigaRipartizione> = {}): RigaRipartizione => ({
  category_id: 'c1',
  nome: 'Ristorazione',
  spesa: '-40.00',
  movimenti: 2,
  spesa_diretta: '0.00',
  movimenti_diretti: 0,
  figli: 0,
  ...v,
});

describe('aperturaDi — dove porta il tocco', () => {
  it('una categoria senza figlie apre i suoi movimenti', () => {
    const a = aperturaDi(riga({ figli: 0 }), 'voluttuario', 'personale');
    expect(a.tipo).toBe('movimenti');
    expect(a).toMatchObject({ classe: 'voluttuario', contesto: 'personale', categoria: 'c1' });
  });

  it('e li chiede STRETTI anche se oggi non ci sono figlie', () => {
    // Se domani qualcuno appende una figlia a questa categoria, la riga deve
    // continuare a dire il vero invece di gonfiarsi in silenzio.
    const a = aperturaDi(riga({ figli: 0 }), null, null);
    expect(a.tipo === 'movimenti' && a.soloQuesta).toBe(true);
  });

  it('una categoria con figlie apre il livello sotto', () => {
    expect(aperturaDi(riga({ figli: 3 }), null, null).tipo).toBe('categorie');
  });

  it('porta con se’ classe e contesto, o il ramo sotto perderebbe il filtro', () => {
    // Aperta la classe «voluttuario · personale», sotto devono comparire le
    // categorie DENTRO quella classe. Senza questi due, ricomparirebbe la
    // spesa intera e i numeri smetterebbero di sommare al padre.
    const a = aperturaDi(riga({ figli: 2 }), 'voluttuario', 'personale');
    expect(a).toMatchObject({ classe: 'voluttuario', contesto: 'personale' });
  });
});

describe('categorieComeNodi — una foglia naviga, non si apre', () => {
  // La regola globale della discesa: classe → categorie → PAGINA dei
  // movimenti. Una foglia srotolata in loco sotto la classe era il salto
  // classe → transazioni che la revisione del 19 agosto vieta.
  it('una categoria senza figlie porta alla lista movimenti filtrata', () => {
    const nodi = categorieComeNodi([riga({ figli: 0 })], '2026-08', 'voluttuario', 'personale');
    expect(nodi[0]?.apertura).toBeNull();
    expect(nodi[0]?.href).toBe(
      '/movimenti?da=2026-08-01&a=2026-08-31&categoria=c1&classe=voluttuario&contesto=personale',
    );
  });

  it('una categoria con figlie apre il livello sotto, in loco', () => {
    const nodi = categorieComeNodi([riga({ figli: 2 })], '2026-08', null, null);
    expect(nodi[0]?.apertura?.tipo).toBe('categorie');
    expect(nodi[0]?.href).toBeNull();
  });

  it('la riga «senza categoria» chiede la pseudo-categoria, non tutte', () => {
    // `category_id` nullo nell'indirizzo sarebbe «nessun filtro», cioe'
    // l'intero mese: la lista plausibile e sbagliata per eccellenza.
    const nodi = categorieComeNodi(
      [riga({ category_id: null, nome: 'Senza categoria' })],
      '2026-08',
      null,
      null,
    );
    expect(nodi[0]?.href).toContain('categoria=senza-categoria');
  });
});

describe('categorieComeNodi — la discesa del ricorrente', () => {
  // Nel ricorrente il fondo non sono i movimenti di un mese ma le VOCI: una
  // foglia si apre ancora invece di navigare, e il tipo viaggia con ogni
  // apertura — perderlo mostrerebbe la spesa intera sotto un titolo che
  // promette il ricorrente.
  it('una foglia apre le voci, non naviga ai movimenti', () => {
    const nodi = categorieComeNodi(
      [riga({ figli: 0 })],
      '2026-08',
      'voluttuario',
      'personale',
      'abitudine',
    );
    expect(nodi[0]?.href).toBeNull();
    expect(nodi[0]?.apertura).toMatchObject({
      tipo: 'ricorrenze',
      ricorrenza: 'abitudine',
      classe: 'voluttuario',
      contesto: 'personale',
      categoria: 'c1',
      soloQuesta: false,
    });
  });

  it('un ramo con figlie porta con sé il tipo di ricorrenza', () => {
    const a = categorieComeNodi([riga({ figli: 2 })], '2026-08', null, null, 'abbonamento')[0]
      ?.apertura;
    expect(a).toMatchObject({ tipo: 'categorie', ricorrenza: 'abbonamento' });
  });

  it('la riga «direttamente qui» apre le sole voci del nodo', () => {
    const nodi = categorieComeNodi(
      [riga({ figli: 1, spesa_diretta: '-10.00', movimenti_diretti: 1 })],
      '2026-08',
      null,
      null,
      'abitudine',
    );
    expect(nodi[1]?.apertura).toMatchObject({ tipo: 'ricorrenze', soloQuesta: true });
  });
});

describe('ricorrenzeComeNodi — il fondo della discesa del ricorrente', () => {
  it('una voce naviga ai movimenti del suo esercente', () => {
    const nodi = ricorrenzeComeNodi(
      [
        {
          merchant_id: 'm1',
          esercente: 'Netflix',
          costo_mensile: '-6.99',
          occorrenze: 11,
          cadenza: 'monthly',
          stato: 'active',
        },
      ],
      null,
    );
    expect(nodi[0]?.href).toBe('/movimenti?esercente=m1');
    expect(nodi[0]?.apertura).toBeNull();
    // La stringa arrivata da Postgres, mai un numero.
    expect(nodi[0]?.importo).toBe('-6.99');
  });
});

describe('versoMovimenti — i filtri si portano tutti', () => {
  it('periodo, classe, contesto e categoria insieme', () => {
    expect(versoMovimenti('2026-07', 'utile', 'business', 'c9')).toBe(
      '/movimenti?da=2026-07-01&a=2026-07-31&categoria=c9&classe=utile&contesto=business',
    );
  });

  it('senza classe e contesto restano solo periodo e categoria', () => {
    expect(versoMovimenti('2026-02', null, null, 'c9')).toBe(
      '/movimenti?da=2026-02-01&a=2026-02-28&categoria=c9',
    );
  });
});

describe('categorieComeNodi — la riga «direttamente qui»', () => {
  it('non compare quando la categoria non ha figlie', () => {
    // Sarebbe un doppione del nodo che la contiene: stesso importo, stessi
    // movimenti, due righe.
    const nodi = categorieComeNodi(
      [riga({ figli: 0, spesa_diretta: '-40.00', movimenti_diretti: 2 })],
      'm',
      null,
      null,
    );
    expect(nodi).toHaveLength(1);
  });

  it('non compare quando la spesa propria e’ zero', () => {
    const nodi = categorieComeNodi([riga({ figli: 2, spesa_diretta: '0.00' })], 'm', null, null);
    expect(nodi).toHaveLength(1);
  });

  it('compare quando ci sono figlie E spesa propria', () => {
    // Qui la somma delle figlie e' minore del padre, e la differenza deve
    // avere un posto dove vedersi.
    const nodi = categorieComeNodi(
      [riga({ figli: 1, spesa_diretta: '-10.00', movimenti_diretti: 1 })],
      'm',
      null,
      null,
    );
    expect(nodi).toHaveLength(2);
    expect(nodi[1]?.etichetta).toContain('direttamente qui');
    expect(nodi[1]?.importo).toBe('-10.00');
  });

  it('e chiede i movimenti del SOLO nodo', () => {
    // È il punto: chiedendo il ramo intero mostrerebbe anche i movimenti delle
    // figlie, che sono gia' contati nella riga sopra.
    const nodi = categorieComeNodi(
      [riga({ figli: 1, spesa_diretta: '-10.00', movimenti_diretti: 1 })],
      'm',
      null,
      null,
    );
    const a = nodi[1]?.apertura;
    expect(a?.tipo).toBe('movimenti');
    expect(a?.tipo === 'movimenti' && a.soloQuesta).toBe(true);
  });

  it('le due righe hanno chiavi diverse', () => {
    // Con la stessa chiave React ne disegnerebbe una sola, e aprire l'una
    // aprirebbe l'altra.
    const nodi = categorieComeNodi([riga({ figli: 1, spesa_diretta: '-10.00' })], 'm', null, null);
    expect(nodi[0]?.chiave).not.toBe(nodi[1]?.chiave);
  });

  it('due mesi diversi non condividono le chiavi', () => {
    // La fisarmonica tiene i figli caricati in una mappa per chiave: se luglio
    // e agosto avessero le stesse, cambiando mese si rivedrebbero i rami del
    // mese prima gia' aperti e pieni dei numeri sbagliati.
    const luglio = categorieComeNodi([riga()], '2026-07', null, null);
    const agosto = categorieComeNodi([riga()], '2026-08', null, null);
    expect(luglio[0]?.chiave).not.toBe(agosto[0]?.chiave);
  });

  it('la spesa resta la stringa arrivata da Postgres', () => {
    // Mai un numero: un importo passato da un float e' un importo di cui non
    // ci si puo' piu' fidare, e questo e' l'ultimo punto in cui potrebbe
    // succedere.
    const nodi = categorieComeNodi([riga({ spesa: '-1234.56' })], 'm', null, null);
    expect(nodi[0]?.importo).toBe('-1234.56');
  });
});

describe('movimentiComeNodi — il fondo della discesa', () => {
  it('un movimento non si apre: porta alla sua scheda', () => {
    const nodi = movimentiComeNodi(
      [
        {
          id: 'abc',
          data: '2026-07-05',
          etichetta: 'Deliveroo',
          importo: '-12.00',
          categoria: null,
        },
      ],
      'c1',
    );
    expect(nodi[0]?.apertura).toBeNull();
    expect(nodi[0]?.href).toBe('/movimenti/abc');
  });

  it('un movimento senza importo in euro vale zero e non rompe l’elenco', () => {
    const nodi = movimentiComeNodi(
      [{ id: 'x', data: '2026-07-05', etichetta: 'Ignoto', importo: null, categoria: null }],
      null,
    );
    expect(nodi[0]?.importo).toBe('0');
  });
});

describe('rientro — si ferma prima di schiacciare gli importi', () => {
  it('cresce col livello', () => {
    expect(rientro(0)).toBe(0);
    expect(rientro(1)).toBe(12);
    expect(rientro(2)).toBe(24);
  });

  it('smette al terzo, o su 320 px l’importo finisce fuori', () => {
    expect(rientro(3)).toBe(36);
    expect(rientro(4)).toBe(36);
    expect(rientro(9)).toBe(36);
  });
});
