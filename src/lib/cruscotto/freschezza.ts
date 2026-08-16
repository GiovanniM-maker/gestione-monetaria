/**
 * Da quanto i dati sono fermi.
 *
 * ---------------------------------------------------------------------------
 * Perche' esiste, e perche' non poteva essere un avviso
 * ---------------------------------------------------------------------------
 * Il 16 agosto 2026 l'utente ha chiesto perche' «Pagato oggi e ieri» dicesse
 * zero dopo aver speso davvero. Non era la vista: nel database l'ultimo
 * movimento era del **12 agosto** e l'ultima sincronizzazione riuscita del
 * **13**. Da tre giorni non arrivava niente.
 *
 * E niente lo diceva. `sync_runs` non aveva nemmeno una riga `failed`, perche'
 * il lavoro notturno **non era partito affatto**: non c'era un errore da
 * registrare. La riga di stato sul cruscotto mostrava «consenso valido ancora
 * 175 giorni» in grigio, cioe' esattamente l'aria di quando va tutto bene.
 *
 * Da cui la regola generale, che vale oltre questo caso:
 *
 *   **ogni sorveglianza che vive dentro la cosa che sorveglia non puo'
 *   accorgersi che quella cosa e' ferma.** L'avviso `sync_failed` della Fase 8
 *   lo genera il lavoro notturno: se il lavoro notturno non gira, l'avviso che
 *   dovrebbe dirlo non nasce.
 *
 * Quindi il controllo si fa **in lettura**, quando la schermata si apre, sul
 * dato che c'e' gia'. Non ha bisogno che qualcosa funzioni per funzionare.
 *
 * ---------------------------------------------------------------------------
 * Le soglie
 * ---------------------------------------------------------------------------
 * Il lavoro gira una volta al giorno. Una notte saltata si ripara da sola al
 * giro dopo — la finestra e' di sette giorni proprio per questo — e non merita
 * un riquadro: un avviso che compare per un intoppo che si risolve da solo
 * insegna a ignorare i riquadri. Due notti no: quello non e' piu' un intoppo.
 *
 *   oltre **48 ore** -> ferma, si mostra;
 *   oltre **120 ore** (cinque giorni) -> grave, ed e' il colore dei guasti.
 *
 * `null` — mai sincronizzato — e' grave e non «zero ore fa»: un'applicazione
 * che non ha mai ricevuto niente non e' un'applicazione aggiornata.
 */

/** Due notti saltate: non e' piu' un intoppo che si ripara da solo. */
const ORE_FERMA = 48;
/** Cinque giorni: a questo punto i numeri sul cruscotto sono di un'altra settimana. */
const ORE_GRAVE = 120;

export type Freschezza = {
  /** Da quante ore l'ultima sincronizzazione riuscita. `null` se non ce n'e' mai stata. */
  ore: number | null;
  /** Gli stessi giorni, per scriverlo: `null` come sopra. */
  giorni: number | null;
  /** Se vale la pena mostrarlo. */
  ferma: boolean;
  /** Se e' il caso di allarmarsi. */
  grave: boolean;
};

/**
 * `adesso` e' un parametro per poterla provare: qui si misura una **distanza
 * fra due istanti**, non un giorno civile, quindi il fuso non c'entra e non si
 * converte niente — la regola su `booking_date` riguarda i giorni, non i
 * timestamp.
 */
export function freschezza(
  ultimaSyncRiuscita: string | null,
  adesso: number = Date.now(),
): Freschezza {
  if (ultimaSyncRiuscita === null) {
    return { ore: null, giorni: null, ferma: true, grave: true };
  }

  const quando = Date.parse(ultimaSyncRiuscita);
  // Una data illeggibile non e' una data recente: nel dubbio si dichiara ferma,
  // perche' l'errore da evitare e' dire «tutto a posto» quando non si sa.
  if (Number.isNaN(quando)) {
    return { ore: null, giorni: null, ferma: true, grave: true };
  }

  const ore = Math.max(0, (adesso - quando) / 3_600_000);
  return {
    ore,
    giorni: Math.floor(ore / 24),
    ferma: ore > ORE_FERMA,
    grave: ore > ORE_GRAVE,
  };
}

/** Quanto tempo e' passato, detto come lo direbbe una persona. */
export function daQuanto(f: Freschezza): string {
  if (f.ore === null) return 'mai';
  if (f.ore < 1) return 'meno di un’ora fa';
  if (f.ore < 24) return `${Math.floor(f.ore)} ore fa`;
  const g = f.giorni ?? 0;
  return g === 1 ? 'ieri' : `${g} giorni fa`;
}
