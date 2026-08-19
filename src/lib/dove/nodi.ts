import type { ReactNode } from 'react';
import { centesimiDi } from '@/lib/abbonamenti/formato';
import type { Variazione } from '@/lib/cruscotto/andamento';
import { CATEGORIA_SENZA, estremiDelMese } from '@/lib/movimenti/filtri';

/**
 * Da cosa risponde il database a cosa disegna la fisarmonica.
 *
 * Un modulo **puro**, come `ui/fette` e `copilota/grafico`, e per la stessa
 * ragione: la regola che sta qui dentro, sbagliata, non da' errore — produce un
 * elenco plausibile in cui **ogni euro compare due volte**, e un totale
 * gonfiato del doppio si nota molto dopo di quanto si creda. Una funzione pura
 * si prova con degli assert; la stessa logica dentro un componente no.
 *
 * ---------------------------------------------------------------------------
 * La regola che questo modulo esiste per non sbagliare
 * ---------------------------------------------------------------------------
 * Un nodo puo' avere delle sottocategorie **e** della spesa registrata su di
 * se'. Tre casi, e solo il terzo e' delicato:
 *
 * 1. **niente figlie** → sotto ci sono i movimenti, e si aprono quelli;
 * 2. **figlie, nessuna spesa propria** → sotto ci sono le figlie, e basta;
 * 3. **figlie e spesa propria** → le figlie *piu'* una riga «direttamente qui».
 *
 * Nel terzo caso la somma delle figlie e' minore del padre, e la differenza
 * deve avere un posto dove vedersi: e' la stessa regola per cui un movimento
 * fuori da un totale porta scritto perche'. Ma quella riga deve chiedere i
 * movimenti del **solo nodo** — se chiedesse il ramo intero, mostrerebbe anche
 * quelli delle figlie, che sono gia' contati nelle righe sopra.
 */

export type Apertura =
  | {
      tipo: 'categorie';
      classe: string | null;
      contesto: string | null;
      categoria: string | null;
      /**
       * `abbonamento` o `abitudine`: la stessa discesa, ristretta al costo
       * ricorrente di quel tipo. Assente = la spesa del mese, come sempre.
       * Viaggia con OGNI apertura del ramo: perderla a un livello mostrerebbe
       * la spesa intera sotto un titolo che promette il ricorrente.
       */
      ricorrenza?: string | null;
    }
  | {
      tipo: 'movimenti';
      classe: string | null;
      contesto: string | null;
      categoria: string | null;
      /** Solo i movimenti di QUESTO nodo, senza le categorie discendenti. */
      soloQuesta: boolean;
    }
  | {
      /**
       * Le voci ricorrenti (gli esercenti) sotto una categoria: il fondo della
       * discesa del ricorrente. Una ricorrenza E' un esercente, e le sue
       * transazioni si aprono dalla sua lista movimenti.
       */
      tipo: 'ricorrenze';
      ricorrenza: string;
      classe: string | null;
      contesto: string | null;
      categoria: string | null;
      soloQuesta: boolean;
    };

export type Nodo = {
  chiave: string;
  etichetta: string;
  dettaglio: string | null;
  /** Stringa decimale, come l'ha scritta Postgres. Mai un numero. */
  importo: string;
  /** La tinta della classe, se il nodo ne ha una. */
  tinta: string | null;
  /** Cosa chiedere per aprirlo. `null` = non si apre. */
  apertura: Apertura | null;
  /** Dove porta il tocco quando il nodo non si apre. */
  href: string | null;
  /**
   * Cosa precede la riga al posto del pallino: una `Tessera` sulla home. E' un
   * nodo e non una chiave, come in `Ripartizione`: chi compone la lista sa
   * gia' che forma serve. Solo il primo livello ne ha una — i figli arrivano
   * dall'API come dati puri e restano col pallino.
   */
  tessera?: ReactNode;
  /** Il confronto col mese tipico, mostrato sotto l'importo. */
  variazione?: Variazione;
  /**
   * Sbiadita: e' la riga del non classificato, che non e' una classe ma un
   * lavoro da fare. Sta per ultima e a mezza voce (docs/aspetto.md §4.3).
   */
  sbiadito?: boolean;
  /**
   * L'identificativo della categoria, quando il nodo e' una categoria.
   * `null` = «senza categoria». Serve alla fisarmonica per disegnare il
   * marchietto — l'icona della categoria nel suo cerchietto — senza che
   * questo modulo debba sapere che aspetto abbia.
   */
  categoria?: string | null;
  /**
   * I figli gia' noti, quando chi costruisce l'albero li ha prefetti.
   *
   * E' la risposta alla lentezza percepita della discesa: il primo livello
   * sotto ogni classe arriva **con la pagina**, e il tocco che lo apre non
   * paga nessun viaggio — la fisarmonica diventa un accordion locale, non una
   * navigazione remota travestita. I livelli piu' in giu' continuano ad
   * arrivare al tocco: prefetchare tutto sarebbe spedire l'albero intero per
   * aprirne un ramo.
   */
  precaricati?: readonly Nodo[];
};

export type RigaRipartizione = {
  category_id: string | null;
  nome: string;
  spesa: string;
  movimenti: number;
  spesa_diretta: string;
  movimenti_diretti: number;
  figli: number;
};

export type RigaMovimentoDove = {
  id: string;
  data: string;
  etichetta: string;
  importo: string | null;
  categoria: string | null;
};

const conta = (n: number, singolare: string, plurale: string): string =>
  `${n} ${n === 1 ? singolare : plurale}`;

/**
 * La lista dei movimenti gia' filtrata, per il tocco su una categoria foglia.
 *
 * Dal 19 agosto la gerarchia e' una regola globale: classe → categorie →
 * **pagina** dei movimenti. Una categoria senza figlie non apre piu' i
 * movimenti in loco — li apre su `/movimenti`, che ha il totale in cima, il
 * riassunto dei filtri e la paginazione — portandosi dietro **tutti** i filtri
 * del punto in cui si era: periodo, classe, contesto, categoria. Perdere un
 * filtro nella discesa non da' errore: mostra una lista plausibile e sbagliata.
 */
export function versoMovimenti(
  mese: string,
  classe: string | null,
  contesto: string | null,
  categoria: string | null,
): string {
  const p = new URLSearchParams();
  const periodo = estremiDelMese(mese);
  if (periodo !== null) {
    p.set('da', periodo.da);
    p.set('a', periodo.a);
  }
  // `null` qui significa «senza categoria», non «tutte»: chi arriva a una
  // foglia ci arriva da una riga precisa, e l'assenza del parametro aprirebbe
  // l'intero mese — la lista plausibile e sbagliata di cui sopra.
  p.set('categoria', categoria ?? CATEGORIA_SENZA);
  if (classe !== null) p.set('classe', classe);
  if (contesto !== null) p.set('contesto', contesto);
  return `/movimenti?${p.toString()}`;
}

/** Come si apre una categoria con delle figlie. Le foglie non si aprono: navigano. */
export function aperturaDi(
  r: Pick<RigaRipartizione, 'category_id' | 'figli'>,
  classe: string | null,
  contesto: string | null,
): Apertura {
  return r.figli > 0
    ? { tipo: 'categorie', classe, contesto, categoria: r.category_id }
    : {
        tipo: 'movimenti',
        classe,
        contesto,
        categoria: r.category_id,
        // Senza figlie il ramo **e'** il nodo, quindi le due strade danno lo
        // stesso insieme. Si chiede comunque quella stretta: se domani qualcuno
        // appende una figlia a questa categoria, la riga continua a dire il
        // vero invece di gonfiarsi in silenzio.
        soloQuesta: true,
      };
}

export function categorieComeNodi(
  righe: readonly RigaRipartizione[],
  prefisso: string,
  classe: string | null,
  contesto: string | null,
  /** Il tipo di ricorrenza quando la discesa e' quella del ricorrente. */
  ricorrenza: string | null = null,
): readonly Nodo[] {
  return righe.flatMap((r): Nodo[] => {
    const chiave = `${prefisso}|${ricorrenza ?? '*'}|${classe ?? '*'}|${contesto ?? '*'}|${r.category_id ?? 'nessuna'}`;
    const voci = ricorrenza !== null;

    // Una foglia e' un collegamento, non un ramo: la regola globale della
    // discesa e' classe → categorie → pagina dei movimenti, mai i movimenti
    // srotolati sotto la classe. Nel ricorrente invece la foglia si apre
    // ancora, sulle VOCI: e' l'esercente il fondo di quella discesa, e la
    // pagina delle transazioni e' la sua.
    const foglia = r.figli === 0;
    const nodo: Nodo = {
      chiave,
      etichetta: r.nome,
      dettaglio: voci
        ? conta(r.movimenti, 'voce', 'voci')
        : conta(r.movimenti, 'movimento', 'movimenti'),
      importo: r.spesa,
      tinta: null,
      categoria: r.category_id,
      apertura: foglia
        ? voci
          ? {
              tipo: 'ricorrenze',
              ricorrenza,
              classe,
              contesto,
              categoria: r.category_id,
              soloQuesta: false,
            }
          : null
        : { tipo: 'categorie', classe, contesto, categoria: r.category_id, ricorrenza },
      href: foglia && !voci ? versoMovimenti(prefisso, classe, contesto, r.category_id) : null,
    };

    // Senza figlie la riga «direttamente qui» sarebbe un doppione del nodo che
    // la contiene: stesso importo, stessi movimenti, due righe.
    if (r.figli === 0 || centesimiDi(r.spesa_diretta) === 0n) return [nodo];

    return [
      nodo,
      {
        chiave: `${chiave}|diretta`,
        etichetta: `${r.nome}, direttamente qui`,
        dettaglio: voci
          ? `${conta(r.movimenti_diretti, 'voce', 'voci')} · non in una sottocategoria`
          : `${conta(r.movimenti_diretti, 'movimento', 'movimenti')} · non in una sottocategoria`,
        importo: r.spesa_diretta,
        tinta: null,
        categoria: r.category_id,
        apertura: voci
          ? {
              tipo: 'ricorrenze',
              ricorrenza,
              classe,
              contesto,
              categoria: r.category_id,
              soloQuesta: true,
            }
          : {
              tipo: 'movimenti',
              classe,
              contesto,
              categoria: r.category_id,
              soloQuesta: true,
            },
        href: null,
      },
    ];
  });
}

export type RigaVoceRicorrente = {
  merchant_id: string;
  esercente: string;
  costo_mensile: string | null;
  occorrenze: number;
  cadenza: string;
  stato: string;
};

/**
 * Le voci ricorrenti come nodi: il fondo della discesa del ricorrente.
 *
 * Una voce non si apre: naviga alla lista movimenti del suo esercente, che
 * sono esattamente gli addebiti della ricorrenza. L'importo mostrato e' il
 * costo **al mese** — la stessa unita' dei rami sopra, o la somma delle righe
 * non tornerebbe col totale del ramo.
 */
export function ricorrenzeComeNodi(
  righe: readonly RigaVoceRicorrente[],
  categoria: string | null,
): readonly Nodo[] {
  return righe.map((r) => ({
    chiave: `voce|${r.merchant_id}|${categoria ?? '*'}`,
    etichetta: r.esercente,
    dettaglio: `${conta(r.occorrenze, 'addebito', 'addebiti')} · al mese`,
    importo: r.costo_mensile ?? '0',
    tinta: null,
    apertura: null,
    href: `/movimenti?esercente=${r.merchant_id}`,
  }));
}

export function movimentiComeNodi(
  righe: readonly RigaMovimentoDove[],
  categoria: string | null,
): readonly Nodo[] {
  return righe.map((r) => ({
    chiave: `mov|${r.id}|${categoria ?? '*'}`,
    etichetta: r.etichetta,
    dettaglio: r.data,
    importo: r.importo ?? '0',
    tinta: null,
    // Il fondo della discesa. Da qui si esce dalla fisarmonica, ed e' giusto:
    // la scheda del movimento e' dove si corregge, e correggere non e'
    // guardare.
    apertura: null,
    href: `/movimenti/${r.id}`,
  }));
}

/**
 * Il rientro cresce col livello, ma si ferma.
 *
 * A quattro livelli da quattordici pixel la colonna degli importi finirebbe
 * schiacciata contro il bordo destro su uno schermo da 320: si perde l'importo,
 * che e' la cosa per cui si guarda l'elenco. Dodici pixel, e dal terzo livello
 * in poi non si aggiunge piu' niente — a quel punto dove ci si trova l'ha gia'
 * detto l'apertura.
 */
export function rientro(livello: number): number {
  return Math.min(livello, 3) * 12;
}
