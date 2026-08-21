/**
 * La tirata per aggiornare, nelle parti che si possono provare.
 *
 * Puro come `ui/fette` e `dove/nodi`, e per la stessa ragione: **la risposta
 * sbagliata non da' errore**. Dire «niente di nuovo» quando la banca non e'
 * stata nemmeno chiamata e' una frase che sembra giusta, si legge come una
 * conferma, e insegna a non credere piu' alla schermata — che e' il guasto che
 * questo progetto teme piu' di un numero sbagliato.
 */

/** Quanto va tirato perche' conti. Sotto, non succede niente. */
export const SOGLIA = 72;

/** Quanto puo' scendere l'indicatore, per quanto corra il dito. */
export const CORSA = 110;

/**
 * Meta' del movimento del dito.
 *
 * Senza attrito il foglio insegue il dito uno a uno, e ogni sfioramento verso
 * il basso su una pagina in cima sembrerebbe l'inizio di un aggiornamento.
 * L'attrito rende il gesto **deliberato**, che e' cio' che lo distingue dallo
 * scorrere.
 */
export const ATTRITO = 0.5;

/** Da quanto si e' mosso il dito a quanto scende l'indicatore. */
export function scesa(movimentoDelDito: number): number {
  if (!Number.isFinite(movimentoDelDito) || movimentoDelDito <= 0) return 0;
  return Math.min(movimentoDelDito * ATTRITO, CORSA);
}

/** Se lasciando adesso parte l'aggiornamento. */
export function faScattare(scesaAttuale: number): boolean {
  return scesaAttuale >= SOGLIA;
}

export type EsitoAggiornamento = {
  righeNuove?: unknown;
  saltata?: unknown;
};

/**
 * Cosa rispondere, e sono quattro cose diverse.
 *
 * Un gesto pretende una risposta: tirare e non veder succedere niente si legge
 * come «e' rotto», non come «non c'era niente». E le quattro risposte non sono
 * intercambiabili —
 *
 * - **dei movimenti**: la schermata sta per cambiare, e va detto perche';
 * - **niente di nuovo**: la banca ha risposto, e non aveva niente;
 * - **gia' aggiornato**: la banca **non e' stata chiamata**. E' una risposta a
 *   una domanda diversa, e spacciarla per la precedente e' la bugia piu' facile
 *   da scrivere in questo file;
 * - **non riuscito**: qualcosa e' andato storto, e non si finge il contrario.
 */
export type Risposta = {
  tipo: 'nuovi' | 'niente' | 'saltato' | 'errore';
  testo: string;
  /** Se la pagina va ricostruita: i suoi numeri sono di un istante fa. */
  ricarica: boolean;
};

export function rispostaDi(esito: EsitoAggiornamento): Risposta {
  const righe = typeof esito.righeNuove === 'number' ? esito.righeNuove : 0;

  // I movimenti nuovi vengono prima di tutto: un giro puo' aver saltato la
  // banca **e** aver comunque normalizzato righe arrivate prima, e in quel caso
  // la notizia e' che ci sono dei movimenti, non che si e' saltato qualcosa.
  if (righe > 0) {
    return {
      tipo: 'nuovi',
      testo: `${righe} ${righe === 1 ? 'movimento nuovo' : 'movimenti nuovi'}.`,
      ricarica: true,
    };
  }

  if (typeof esito.saltata === 'string' && esito.saltata.trim() !== '') {
    return { tipo: 'saltato', testo: 'Già aggiornato poco fa.', ricarica: false };
  }

  return { tipo: 'niente', testo: 'Niente di nuovo.', ricarica: false };
}

/** Quando la richiesta non e' nemmeno arrivata a destinazione. */
export function rispostaPerErrore(stato: number | null): Risposta {
  return {
    tipo: 'errore',
    testo:
      stato === 401
        ? 'Sessione scaduta: ricarica la pagina.'
        : 'Non sono riuscito a chiedere alla banca.',
    ricarica: false,
  };
}
