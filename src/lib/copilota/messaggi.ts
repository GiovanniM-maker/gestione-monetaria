/**
 * Le forme che attraversano il confine fra server e browser.
 *
 * Stanno in un modulo **puro** perché la schermata della conversazione è un
 * componente client, e i moduli che eseguono le operazioni sono `server-only`.
 * Un `import type` verrebbe cancellato in compilazione, ma la stessa lezione
 * l'ha già insegnata la Fase 5: basta che un giorno qualcuno importi da lì una
 * costante invece di un tipo, e la build fallisce con un errore che parla di
 * tutt'altro. Meglio che il confine sia un file, non una disciplina.
 */

/** Una scrittura preparata dal copilot, in attesa che l'utente la applichi. */
export type Proposta = {
  operazione:
    | 'correggi_movimento'
    | 'segna_episodica'
    | 'imposta_obiettivo'
    | 'aggiorna_esercente'
    | 'crea_categoria'
    | 'sposta_movimento'
    | 'crea_classe'
    | 'aggiorna_classe'
    | 'elimina_classe';
  argomenti: Record<string, unknown>;
  /**
   * Cosa succede se si applica, scritto **dal server** dagli argomenti risolti
   * e non dal modello.
   *
   * È la frase che l'utente legge prima di toccare il bottone. Farla scrivere
   * al modello significherebbe far approvare una cosa e farne succedere
   * un'altra: basta che riassuma male, e il consenso non vale più niente.
   */
  descrizione: string;
};

export type PropostaSalvata = Proposta & { applicata_at: string | null };

/**
 * Un grafico che il copilot ha chiesto di disegnare.
 *
 * I punti vengono **sempre** da una query: il modello sceglie cosa disegnare —
 * quale grandezza, quanti mesi — e non cosa c'è dentro. È la stessa divisione
 * di tutto il resto dell'applicazione: le cifre le produce SQL, il modello
 * decide di cosa parlare.
 *
 * `valore` è testo e non un numero, come ogni importo che attraversa un
 * confine: un `numeric` serializzato in JSON diventa un float, e sarebbe
 * assurdo perdere un centesimo proprio per disegnarlo.
 */
export type Punto = { etichetta: string; valore: string };
export type Serie = { nome: string; punti: readonly Punto[] };

export type Grafico = {
  titolo: string;
  tipo: 'linee' | 'barre';
  serie: readonly Serie[];
  /** Cosa il grafico non mostra, quando c'è. Va scritto sotto, non taciuto. */
  nota?: string;
};

/** Un'operazione eseguita, con quello che ha restituito. È la prova. */
export type StrumentoEseguito = {
  nome: string;
  argomenti: unknown;
  dati: unknown;
};

export type MessaggioSalvato = {
  id: string;
  ruolo: 'utente' | 'copilota';
  testo: string;
  strumenti: readonly StrumentoEseguito[] | null;
  proposte: readonly PropostaSalvata[] | null;
  grafici: readonly Grafico[] | null;
  /** Cifre scritte dal modello che nei dati letti non c'erano. */
  cifre_inventate: readonly string[] | null;
  created_at: string;
};
