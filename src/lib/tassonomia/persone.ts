/**
 * Decide quali etichette possono uscire verso un LLM.
 *
 * È una regola di sicurezza, non un'ottimizzazione: la **regola 8** di
 * `CLAUDE.md` vieta di mandare a un modello le controparti dei bonifici
 * privati. Il controllo gira **prima** della chiamata — dopo, il dato è uscito.
 *
 * ---------------------------------------------------------------------------
 * Perché non basta guardare com'è fatto il nome
 * ---------------------------------------------------------------------------
 * La prima versione deduceva "è una persona" dalla forma della stringa: due o
 * tre parole, tutte maiuscole, nessuna cifra. I test l'hanno bocciata subito, e
 * per una ragione insuperabile:
 *
 *     Bovi Laura        persona
 *     Panfe Bologna     esercente
 *
 * Sono la stessa identica forma. Nessuna regola sulla stringa può separarle,
 * perché l'informazione non è nella stringa.
 *
 * È nel **tipo di operazione**. Un pagamento con carta ha per forza un
 * esercente dall'altra parte: si paga con la carta in un negozio, non a un
 * amico. Un bonifico può avere chiunque. Quindi il discriminante è
 * `bank_transaction_code`, che la banca ci dà e che noi salviamo.
 *
 * La forma del nome resta come **seconda rete**, per i movimenti in cui il
 * codice manca. Lì torna a essere timida per scelta: in dubbio trattiene,
 * perché il costo dei due errori non è simmetrico. Un falso positivo costa una
 * classificazione a mano; un falso negativo manda il nome di un privato a un
 * servizio esterno, e non si torna indietro.
 */

/** Il codice che la banca usa per i pagamenti con carta. */
export const CODICE_CARTA = 'CARD_PAYMENT';

/**
 * Parole che dichiarano un'attività: nessuno si chiama "Bar Srl".
 * Servono solo alla seconda rete, quando il codice dell'operazione manca.
 */
const SEGNI_DI_ATTIVITA = [
  'srl', 'srls', 'spa', 'sas', 'snc', 'ltd', 'limited', 'inc', 'llc', 'gmbh', 'bv',
  'bar', 'caffe', 'caffetteria', 'ristorante', 'pizzeria', 'trattoria', 'osteria', 'pub',
  'hotel', 'albergo', 'farmacia', 'parafarmacia', 'studio', 'clinica', 'palestra',
  'supermercato', 'market', 'store', 'shop', 'negozio', 'tabaccheria', 'tabacchi',
  'gelateria', 'pasticceria', 'panificio', 'panetteria', 'paninoteca', 'piadineria',
  'sushi', 'ramen', 'burger', 'food', 'cafe', 'bistrot', 'buffet', 'chiosco',
  'trasporti', 'autolinee', 'bus', 'taxi', 'parking', 'parcheggio', 'stazione',
  'com', 'io', 'net', 'ai', 'app', 'cloud', 'lab', 'laboratorio',
  'servizi', 'service', 'group', 'italia',
];

function parole(etichetta: string): string[] {
  return etichetta
    .toLowerCase()
    .replace(/[^a-zà-ÿ0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((p) => p !== '');
}

/**
 * La seconda rete: la forma di un nome proprio. Usata **solo** quando il tipo
 * di operazione non è noto, perché da sola confonde `Panfe Bologna` con
 * `Bovi Laura`.
 */
export function sembraPersona(etichetta: string): boolean {
  const grezzo = etichetta.trim();
  if (grezzo === '') return false;

  const p = parole(grezzo);
  if (p.length < 2 || p.length > 4) return false;
  if (p.some((w) => SEGNI_DI_ATTIVITA.includes(w))) return false;

  const originali = grezzo.split(/\s+/).filter((w) => /[A-Za-zÀ-ÿ]/.test(w));
  if (originali.length < 2) return false;

  return originali.every((w) => /^[A-ZÀ-Þ]/.test(w) && /^[A-Za-zÀ-ÿ'.]+$/.test(w));
}

export type EtichettaCandidata = {
  etichetta: string;
  /**
   * `true` solo se **ogni** movimento di questa etichetta è un pagamento con
   * carta. Basta un bonifico nel gruppo perché non lo sia: la garanzia deve
   * valere per tutte le occorrenze, non per la maggioranza.
   */
  soloCarta: boolean;
};

export type Selezione = {
  inviabili: readonly string[];
  /** Trattenute perché contengono o potrebbero contenere un nome di persona. */
  trattenute: readonly string[];
};

export function selezionaInviabili(candidate: readonly EtichettaCandidata[]): Selezione {
  const inviabili: string[] = [];
  const trattenute: string[] = [];

  for (const c of candidate) {
    // Pagamento con carta: dall'altra parte c'e' un esercente per costruzione,
    // qualunque forma abbia il nome.
    if (c.soloCarta) inviabili.push(c.etichetta);
    else if (sembraPersona(c.etichetta)) trattenute.push(c.etichetta);
    else inviabili.push(c.etichetta);
  }

  return { inviabili, trattenute };
}
