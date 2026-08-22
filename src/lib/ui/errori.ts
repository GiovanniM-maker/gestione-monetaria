/**
 * Da una risposta che non e' andata bene a una frase che si puo' leggere.
 *
 * ---------------------------------------------------------------------------
 * Il difetto che questo file esiste per chiudere
 * ---------------------------------------------------------------------------
 * Ventidue route sotto `/api/admin/` rispondono `{ error: 'unauthorized' }`, e
 * tredici componenti rendevano quella stringa **alla lettera**:
 *
 *     setErrore(String(esito['error'] ?? risposta.status));
 *
 * Il gettone di sessione dura circa un'ora e questa applicazione resta aggiunta
 * alla schermata iniziale per giorni: quando scade — il caso normale, non un
 * caso limite — il primo tocco su «Va bene» produceva un riquadro rosso
 * contenente **una parola inglese**. Dove la route non metteva un messaggio, il
 * ripiego era `risposta.status`: si leggeva **`500`**.
 *
 * ---------------------------------------------------------------------------
 * Quattro famiglie, e ognuna dice cosa fare
 * ---------------------------------------------------------------------------
 * Non un messaggio per ogni codice: quattro situazioni che l'utente vive in
 * modo diverso. La sessione si riapre, la rete si riprova, un dato sbagliato si
 * corregge, un guasto si segnala. Un messaggio che non suggerisce l'azione e'
 * un «Something went wrong» piu' lungo.
 *
 * Il testo grezzo del server non sparisce: viaggia in `dettaglio` e la nota lo
 * mette sotto un «dettagli tecnici». Serve a chi sviluppa, non a chi usa.
 */

export type Spiegazione = {
  /** La frase principale. Sempre in italiano, sempre sull'accaduto. */
  titolo: string;
  /** Cosa resta vero, e cosa si puo' fare. */
  spiegazione: string;
  /** Il testo che ha mandato il server, per la diagnostica. */
  dettaglio: string | null;
  /** La sessione e' scaduta: serve il collegamento per rientrare. */
  rientra: boolean;
  /** Vale la pena rifare la stessa cosa: non e' colpa di cio' che si e' scritto. */
  riprova: boolean;
};

/** Cosa il server ha messo nel corpo, se ci ha messo qualcosa di leggibile. */
function grezzo(corpo: unknown): string | null {
  const testo = (corpo as { error?: unknown } | null)?.error;
  if (typeof testo !== 'string' || testo.trim() === '') return null;
  return testo;
}

/**
 * `unauthorized` e `forbidden` sono i due gettoni tecnici che le route
 * restituiscono, e sono esattamente quelli che non devono mai raggiungere una
 * schermata. Se il corpo contiene **solo** quelli, il dettaglio non aggiunge
 * niente e si tace.
 */
const GETTONI_TECNICI = new Set(['unauthorized', 'forbidden']);

export function spiegaErrore(stato: number, corpo: unknown): Spiegazione {
  const testo = grezzo(corpo);
  const dettaglio = testo !== null && !GETTONI_TECNICI.has(testo) ? testo : null;

  if (stato === 401) {
    return {
      titolo: 'La sessione è scaduta',
      spiegazione:
        'Il collegamento con la banca è ancora valido: basta rientrare. Quello che stavi facendo non è stato salvato.',
      dettaglio,
      rientra: true,
      riprova: false,
    };
  }

  if (stato === 403) {
    return {
      titolo: 'Questo indirizzo non è ammesso',
      spiegazione:
        'L’applicazione accetta un solo account. Se hai fatto accesso con un altro indirizzo, esci e rientra con quello giusto.',
      dettaglio,
      rientra: true,
      riprova: false,
    };
  }

  // 0 e' la risposta di `fetch` quando la richiesta non e' nemmeno partita.
  if (stato === 0 || stato === 408 || stato === 504) {
    return {
      titolo: 'Non riesco a raggiungere il server',
      spiegazione:
        'Può essere la rete. I numeri che vedi sono quelli letti l’ultima volta e restano validi; quello che stavi scrivendo è ancora qui.',
      dettaglio,
      rientra: false,
      riprova: true,
    };
  }

  if (stato === 404) {
    return {
      titolo: 'Questa cosa non c’è più',
      spiegazione: 'Può essere stata rimossa o archiviata da un’altra scheda. Ricarica la pagina.',
      dettaglio,
      rientra: false,
      riprova: false,
    };
  }

  // 4xx con un messaggio: e' quasi sempre una validazione, e il server sa dire
  // meglio di noi cosa non andava. La sua frase diventa il titolo.
  if (stato >= 400 && stato < 500) {
    return {
      titolo: dettaglio ?? 'Questa modifica non è stata accettata',
      spiegazione: 'Correggi quello che hai inserito e riprova. Niente è stato salvato.',
      dettaglio: dettaglio === null ? testo : null,
      rientra: false,
      riprova: false,
    };
  }

  return {
    titolo: 'Il server non ce l’ha fatta',
    spiegazione:
      'È un guasto nostro, non un problema dei tuoi dati: niente è stato modificato. Riprovare di solito basta.',
    dettaglio,
    rientra: false,
    riprova: true,
  };
}

/**
 * Un errore che sappiamo gia' spiegare, senza che passi da una risposta HTTP.
 *
 * Serve ai casi in cui il fallimento lo riconosce il codice — «la categoria e'
 * stata creata ma non so quale sia» — e la frase giusta la sa gia' chi chiama.
 * Passa dallo stesso tipo di tutti gli altri, cosi' la nota che lo mostra e'
 * una sola.
 */
export function spiegaTesto(
  titolo: string,
  spiegazione = 'Riprova, oppure ricarica la pagina.',
): Spiegazione {
  return { titolo, spiegazione, dettaglio: null, rientra: false, riprova: false };
}

/** Quando `fetch` stesso e' fallito: non c'e' nessuno stato da leggere. */
export function spiegaEccezione(errore: unknown): Spiegazione {
  return {
    ...spiegaErrore(0, null),
    dettaglio: errore instanceof Error ? errore.message : String(errore),
  };
}

/**
 * Legge il corpo di una risposta senza poter fallire.
 *
 * **Va chiamata su una risposta non ancora letta.** Il corpo di una `Response`
 * si consuma una volta sola: se chi chiama ha gia' fatto `risposta.json()`, qui
 * il secondo tentativo fallisce, il `catch` restituisce `null`, e il messaggio
 * del server — quello utile, «Il nome della categoria e' gia' in uso» — sparisce
 * senza che niente lo segnali. In quel caso si usa `spiegaErrore(stato, corpo)`
 * con il corpo che si ha gia' in mano. E' successo in quattro punti la prima
 * volta che questo file e' stato collegato.
 *
 * Una route che risponde 502 puo' restituire HTML, e un `json()` che lancia
 * dentro il ramo dell'errore trasformerebbe un errore spiegabile in un errore
 * non gestito — cioe' nella schermata di guasto, per un caso che sapevamo
 * gestire.
 */
export async function spiegaRisposta(risposta: Response): Promise<Spiegazione> {
  let corpo: unknown = null;
  try {
    corpo = await risposta.json();
  } catch {
    corpo = null;
  }
  return spiegaErrore(risposta.status, corpo);
}
