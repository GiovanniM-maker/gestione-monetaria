import { centesimiDi } from '@/lib/abbonamenti/formato';

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
    }
  | {
      tipo: 'movimenti';
      classe: string | null;
      contesto: string | null;
      categoria: string | null;
      /** Solo i movimenti di QUESTO nodo, senza le categorie discendenti. */
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

/** Come si apre una categoria: sulle figlie se ne ha, sui suoi movimenti se no. */
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
): readonly Nodo[] {
  return righe.flatMap((r): Nodo[] => {
    const chiave = `${prefisso}|${classe ?? '*'}|${contesto ?? '*'}|${r.category_id ?? 'nessuna'}`;

    const nodo: Nodo = {
      chiave,
      etichetta: r.nome,
      dettaglio: conta(r.movimenti, 'movimento', 'movimenti'),
      importo: r.spesa,
      tinta: null,
      apertura: aperturaDi(r, classe, contesto),
      href: null,
    };

    // Senza figlie la riga «direttamente qui» sarebbe un doppione del nodo che
    // la contiene: stesso importo, stessi movimenti, due righe.
    if (r.figli === 0 || centesimiDi(r.spesa_diretta) === 0n) return [nodo];

    return [
      nodo,
      {
        chiave: `${chiave}|diretta`,
        etichetta: `${r.nome}, direttamente qui`,
        dettaglio: `${conta(r.movimenti_diretti, 'movimento', 'movimenti')} · non in una sottocategoria`,
        importo: r.spesa_diretta,
        tinta: null,
        apertura: {
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
