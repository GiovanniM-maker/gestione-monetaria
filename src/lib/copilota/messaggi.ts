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
  operazione: 'correggi_movimento' | 'aggiorna_esercente' | 'crea_categoria';
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
  /** Cifre scritte dal modello che nei dati letti non c'erano. */
  cifre_inventate: readonly string[] | null;
  created_at: string;
};
