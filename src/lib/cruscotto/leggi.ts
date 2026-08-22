/**
 * Le forme delle righe del cruscotto.
 *
 * Solo tipi: le letture stanno in `letture.ts`, una per una e deduplicate con
 * `cache()`. Prima qui c'era anche una `leggiCruscotto()` che leggeva undici
 * cose insieme — comoda da scrivere, e il motivo per cui la schermata restava
 * bianca finche' la piu' lenta non aveva finito.
 *
 * Le colonne `numeric` si chiedono **sempre** con `::text`: PostgREST le
 * serializza come numero JSON, e un importo passato da un float e' un importo
 * di cui non ci si puo' piu' fidare.
 */

export type RigaTotaleMese = {
  mese: string;
  spesa: string;
  movimenti: number;
  senza_cambio: number;
  senza_categoria: number;
  spesa_senza_categoria: string;
  /**
   * Le righe che nessun automatismo puo' sistemare. Senza un esercente non
   * c'e' una categoria da cui ereditare la classe, e la regola 8 vieta di
   * chiedere a un modello chi sia una controparte privata: solo l'utente sa se
   * un bonifico e' un affitto, un prestito o un compenso.
   */
  senza_classe: number;
  spesa_senza_classe: string;
};

export type RigaClasse = {
  /** Lo slug della classe, oppure `non classificato` per un `null` nei dati. */
  discrezionalita: string;
  /** Il nome mostrato. Cambia con un rinomina; lo slug no. */
  classe_nome: string;
  /** La chiave di tavolozza, non un colore: la tinta sta in `globals.css`. */
  colore: string;
  ordine: number;
  contesto: string;
  spesa: string;
  movimenti: number;
};

export type RigaCategoria = {
  category_id: string;
  categoria: string;
  slug: string;
  parent_id: string | null;
  sort_order: number | null;
  spesa: string;
  movimenti: number;
  spesa_diretta: string;
  movimenti_diretti: number;
};

export type RigaEsercente = {
  merchant_id: string | null;
  esercente: string;
  discrezionalita: string;
  contesto: string;
  spesa: string;
  movimenti: number;
};

export type RigaEntrate = {
  mese: string;
  entrate: string;
  movimenti: number;
  senza_cambio: number;
};
