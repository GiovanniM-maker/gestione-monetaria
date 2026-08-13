/**
 * Decide quali etichette possono uscire verso un LLM.
 *
 * È una regola di sicurezza, non un'ottimizzazione: la **regola 8** di
 * `CLAUDE.md` vieta di mandare a un modello le controparti dei bonifici
 * privati. Il controllo gira **prima** della chiamata — dopo, il dato è uscito.
 *
 * ---------------------------------------------------------------------------
 * Due versioni sbagliate, e cosa hanno insegnato
 * ---------------------------------------------------------------------------
 * **La prima** deduceva "è una persona" dalla forma della stringa. Bocciata dai
 * test in un minuto: `Bovi Laura` e `Panfe Bologna` hanno la stessa identica
 * forma, e l'informazione non è nella stringa.
 *
 * **La seconda** — questa — ha lasciato uscire davvero il nome di una
 * controparte di bonifico: `Massimiliano De Jesus Sarta Naccarata`, cinque
 * parole, mentre il riconoscimento accettava solo nomi da due a quattro. Ma il
 * numero di parole era il sintomo. Il difetto era la **direzione della regola**:
 * inviava per difetto e tratteneva per eccezione, quindi ogni forma non
 * prevista finiva fuori.
 *
 * Una regola di sicurezza deve fallire chiusa. Ora:
 *
 * 1. **Pagamento con carta → si invia.** Dall'altra parte di una carta c'è un
 *    esercente per costruzione: con la carta si paga in un negozio, non a un
 *    amico. È l'unica garanzia che viene dai dati e non da un'inferenza.
 * 2. **Tutto il resto → si trattiene**, a meno che il nome non dichiari
 *    un'attività: una forma societaria, una parola di mestiere, un dominio, un
 *    codice. Non "non sembra una persona", ma "**sembra un'azienda**". La
 *    differenza è tutta lì: la prima ammette l'ignoto, la seconda no.
 *
 * Il prezzo è qualche classificazione a mano in più. Il prezzo dell'errore
 * opposto è un nome di un privato uscito verso un servizio esterno, e da lì
 * non si torna indietro.
 */

/** Il codice che la banca usa per i pagamenti con carta. */
export const CODICE_CARTA = 'CARD_PAYMENT';

/** Forme societarie: nessuna persona si chiama "Srl". */
const FORME_SOCIETARIE = [
  'srl',
  'srls',
  'spa',
  's.p.a',
  'sas',
  'snc',
  'sc',
  'scarl',
  'coop',
  'ltd',
  'limited',
  'inc',
  'llc',
  'plc',
  'gmbh',
  'bv',
  'nv',
  'ag',
  'sa',
  'sl',
];

/** Parole che dichiarano un mestiere o un luogo di commercio. */
const MESTIERI = [
  'bar',
  'caffe',
  'caffetteria',
  'cafe',
  'ristorante',
  'ristoro',
  'pizzeria',
  'trattoria',
  'osteria',
  'pub',
  'birreria',
  'enoteca',
  'bistrot',
  'buffet',
  'chiosco',
  'gelateria',
  'pasticceria',
  'panificio',
  'panetteria',
  'forno',
  'paninoteca',
  'piadineria',
  'rosticceria',
  'sushi',
  'ramen',
  'kebab',
  'burger',
  'hotel',
  'albergo',
  'ostello',
  'camping',
  'agriturismo',
  'farmacia',
  'parafarmacia',
  'studio',
  'clinica',
  'poliambulatorio',
  'laboratorio',
  'palestra',
  'piscina',
  'centro',
  'salone',
  'parrucchiere',
  'estetica',
  'supermercato',
  'market',
  'store',
  'shop',
  'negozio',
  'boutique',
  'outlet',
  'tabaccheria',
  'tabacchi',
  'edicola',
  'libreria',
  'cartoleria',
  'ferramenta',
  'trasporti',
  'autolinee',
  'autonoleggio',
  'taxi',
  'parking',
  'parcheggio',
  'stazione',
  'aeroporto',
  'biglietteria',
  'distributore',
  'carburanti',
  'cinema',
  'teatro',
  'museo',
  'bowling',
  'ticket',
  'events',
  'cloud',
  'software',
  'digital',
  'tech',
  'lab',
  'media',
  'studios',
  'servizi',
  'service',
  'group',
  'company',
  'italia',
  'international',
];

/** Marcatori che un incassatore antepone al nome dell'esercente. */
const PREFISSI_INCASSO = [
  'sumup',
  'sq',
  'paypal',
  'satispay',
  'nexi',
  'stripe',
  'mol',
  'mne',
  'pos',
];

function parole(etichetta: string): string[] {
  return (
    etichetta
      .toLowerCase()
      // `S.a.s.` va ricomposta in `sas` prima di spezzare sulla punteggiatura, o
      // diventerebbe tre lettere sciolte e la forma societaria sparirebbe. Vale
      // per `s.r.l.`, `s.p.a.`, `s.n.c.`: sono le sigle che dichiarano
      // un'azienda, ed e' proprio quando sono scritte per esteso che si
      // riconoscono meno.
      .replace(/\b(?:[a-z]\.){2,}/g, (sigla) => sigla.replace(/\./g, ''))
      .replace(/[^a-zà-ÿ0-9]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter((p) => p !== '')
  );
}

/**
 * `true` solo se il nome **dichiara** un'attività commerciale.
 *
 * È un test positivo, non l'assenza di un sospetto: in dubbio risponde `false`
 * e l'etichetta non esce.
 */
export function sembraAttivita(etichetta: string): boolean {
  const grezzo = etichetta.trim();
  if (grezzo === '') return false;

  const p = parole(grezzo);
  if (p.length === 0) return false;

  if (p.some((w) => FORME_SOCIETARIE.includes(w))) return true;
  if (p.some((w) => MESTIERI.includes(w))) return true;
  if (p.some((w) => PREFISSI_INCASSO.includes(w))) return true;

  // Un dominio è un'insegna: nessuno si chiama `klingai.com`.
  if (/\.(com|it|io|net|org|ai|co|eu|shop|app)\b/i.test(grezzo)) return true;
  if (/\bwww\./i.test(grezzo)) return true;

  // Cifre e asterischi vengono dai terminali di pagamento e dai codici
  // negozio: `Lidl 1361`, `Canva* I04731`. Un bonifico a un privato riporta
  // un nome, non un identificativo.
  if (/\d/.test(grezzo)) return true;
  if (/[*#]/.test(grezzo)) return true;

  // Parola sola: `Deliveroo`, `Esselunga`, `Coinbase`. Un bonifico privato
  // porta nome e cognome, praticamente mai un termine unico.
  return p.length === 1;
}

/**
 * La chiave con cui si confrontano due nomi di esercente.
 *
 * Minuscole e senza spazi ai bordi, e nient'altro: in Fase 4 si è misurato che
 * una normalizzazione aggressiva unisce esercenti distinti — `Comet Spa` e
 * `Bruno Spa-modica` — e **fondere due esercenti è peggio che tenerne uno
 * diviso in due**, perché il secondo si vede e si corregge mentre il primo
 * produce un totale plausibile e sbagliato.
 *
 * Il vincolo `canonical_norm` garantisce che due esercenti non possano
 * differire solo per maiuscole, quindi questa chiave non può far collidere due
 * nomi diversi.
 */
export function chiaveNome(nome: string): string {
  return nome.trim().toLowerCase();
}

export type EtichettaCandidata = {
  etichetta: string;
  /**
   * `true` solo se **ogni** movimento di questa etichetta è un pagamento con
   * carta. Basta un bonifico nel gruppo perché non lo sia: la garanzia deve
   * valere per tutte le occorrenze, non per la maggioranza — il movimento che
   * sfugge è proprio quello che non deve uscire.
   */
  soloCarta: boolean;
};

export type Selezione = {
  inviabili: readonly string[];
  /** Trattenute perché potrebbero contenere il nome di una persona. */
  trattenute: readonly string[];
};

export function selezionaInviabili(candidate: readonly EtichettaCandidata[]): Selezione {
  const inviabili: string[] = [];
  const trattenute: string[] = [];

  for (const c of candidate) {
    if (c.soloCarta || sembraAttivita(c.etichetta)) inviabili.push(c.etichetta);
    else trattenute.push(c.etichetta);
  }

  return { inviabili, trattenute };
}
