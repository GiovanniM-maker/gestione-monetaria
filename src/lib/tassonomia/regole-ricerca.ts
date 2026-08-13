/**
 * Cosa può uscire verso un motore di ricerca — la regola 8b.
 *
 * ---------------------------------------------------------------------------
 * Perché è una regola nuova e non un'estensione della 8
 * ---------------------------------------------------------------------------
 * La regola 8 governa cosa arriva a un LLM. Una ricerca è un'esposizione
 * **diversa e peggiore** per due motivi concreti:
 *
 * 1. l'interrogazione finisce in log che non controlliamo, presso un servizio
 *    che non abbiamo scelto per custodire i nostri dati;
 * 2. non si può cancellare, e non c'è nessuno a cui chiederlo.
 *
 * Quindi la regola è più stretta, non uguale:
 *
 * > **8b. Verso un motore di ricerca esce SOLO il nome di un esercente, e solo
 * > se garantito dalla carta. Mai un importo, mai una data, mai insieme ad
 * > altro.**
 *
 * Che io abbia speso 300 € da un negozio è un fatto su di me. Che quel negozio
 * esista è un fatto sul mondo. Solo il secondo può uscire.
 *
 * ---------------------------------------------------------------------------
 * La garanzia della carta non è qui dentro
 * ---------------------------------------------------------------------------
 * Sta in `v_esercenti_da_cercare`, dentro la vista, perché una vista si
 * interroga da molti posti e quasi tutti si dimenticherebbero il filtro. Qui
 * c'è l'**ultimo controllo prima della rete**: verifica che ciò che sta per
 * partire sia soltanto un nome, e niente che assomigli a un dato bancario.
 *
 * Due controlli sullo stesso fatto non sono uno spreco. Il primo decide *chi*
 * può essere cercato, il secondo *cosa* viene scritto nell'interrogazione, e
 * sono due modi diversi di sbagliare.
 */

/** Perché un nome non può essere cercato. `null` = può. */
export type Rifiuto =
  | 'vuoto'
  | 'troppo corto'
  | 'sembra un IBAN'
  | 'sembra un indirizzo email'
  | 'contiene una sequenza di cifre troppo lunga'
  | 'contiene un importo';

/**
 * Un IBAN, anche spezzato da spazi. Due lettere, due cifre, poi almeno dieci
 * caratteri alfanumerici.
 */
const IBAN = /\b[A-Z]{2}\s*\d{2}(?:\s*[A-Z0-9]){10,}\b/i;

const EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;

/**
 * Undici cifre di fila o più: un IBAN, un numero di carta, un telefono, un
 * codice fiscale.
 *
 * La soglia è alta di proposito. I nomi degli esercenti **contengono cifre di
 * continuo** — `Lidl 1361`, `Starbucks 17831`, `Poundland Ltd - 2205` — e sono
 * numeri di punto vendita, cioè informazioni sul negozio e non su di me.
 * Vietarle tutte renderebbe la ricerca inutile proprio sui nomi che ne hanno
 * più bisogno.
 */
const CIFRE_LUNGHE = /\d{11,}/;

/**
 * Qualcosa scritto come un importo: `12,50`, `1.234,56`, `€ 89`, `89 EUR`.
 *
 * Un nome di esercente non contiene mai un prezzo. Se ce n'è uno, chi ha
 * costruito l'interrogazione ha attaccato al nome qualcosa che non doveva —
 * ed è esattamente l'errore che questa funzione esiste per fermare.
 */
const IMPORTO = /(?:€|\beur\b)\s*\d|\d\s*(?:€|\beur\b)|\b\d{1,3}(?:[.\s]\d{3})*[.,]\d{2}\b/i;

/**
 * `null` se il nome può essere cercato, altrimenti il motivo.
 *
 * Fallisce chiuso: qualunque dubbio è un rifiuto. Il prezzo di un rifiuto in
 * più è una classificazione a mano; il prezzo di un invio in più è un dato che
 * non torna indietro.
 */
export function motivoDelRifiuto(nome: string): Rifiuto | null {
  const pulito = nome.trim();

  if (pulito === '') return 'vuoto';
  // Sotto i tre caratteri non si cerca niente di sensato, e una sigla di due
  // lettere produce risultati casuali che il modello prenderebbe per fatti.
  if (pulito.length < 3) return 'troppo corto';
  if (IBAN.test(pulito)) return 'sembra un IBAN';
  if (EMAIL.test(pulito)) return 'sembra un indirizzo email';
  if (CIFRE_LUNGHE.test(pulito.replace(/[\s-]/g, ''))) {
    return 'contiene una sequenza di cifre troppo lunga';
  }
  if (IMPORTO.test(pulito)) return 'contiene un importo';

  return null;
}

/**
 * L'interrogazione da mandare, o `null` se non si può mandare niente.
 *
 * È **il nome e nient'altro**. Nessuna parola aggiunta: né «cos'è», né
 * «negozio», né la città. Ogni parola in più è una parola che non viene dai
 * dati e che potrebbe orientare il risultato verso ciò che ci aspettiamo —
 * e un motore che conferma l'ipotesi è peggio di nessun motore.
 *
 * Gli spazi si normalizzano perché una doppia spaziatura non cambia il
 * significato ma cambia la stringa nei log altrui.
 */
export function interrogazione(nome: string): string | null {
  if (motivoDelRifiuto(nome) !== null) return null;
  return nome.trim().replace(/\s+/g, ' ');
}

// ---------------------------------------------------------------------------
// La pertinenza — che il risultato parli davvero di quell'esercente
// ---------------------------------------------------------------------------
// Osservato sui dati veri, la prima volta che la ricerca è girata:
//
//   `Bruno Spa Modica`      → «Bruno Elettrodomestici S.r.l. a Modica (RG)»  ✓
//   `Aspit Campogalliano`   → «Calcola pedaggio dal casello di Campogalliano» ✗
//
// Nel secondo caso il motore ha agganciato il **paese** e ha ignorato
// l'azienda. Il testo è vero, pertinente a Campogalliano, e non dice niente su
// Aspit. Dato al modello diventerebbe un fatto: classificherebbe l'azienda
// sotto trasporti o pedaggi con una motivazione perfettamente argomentata e
// senza nessun fondamento — che è lo stesso modo di sbagliare misurato in
// Fase 4, solo con una fonte esterna a fargli da complice.
//
// **Un risultato non pertinente è peggio di nessun risultato**, perché nessun
// risultato lascia il modello nel dubbio mentre uno sbagliato glielo toglie.
//
// Il controllo: la **prima parola significativa** del nome deve comparire nel
// testo trovato. È la parola che porta il marchio — i nomi degli esercenti sono
// costruiti così, marchio prima e luogo o filiale dopo. `Bruno` compare,
// `Aspit` no.
//
// Perché la prima e non una qualsiasi: in `Aspit Campogalliano` anche
// `Campogalliano` è una parola del nome, e compare in tutti i risultati
// sbagliati. Accettare una parola qualsiasi farebbe passare proprio il caso che
// questo controllo esiste per fermare.

/** Sigle che non identificano nessuno: si saltano cercando la parola del marchio. */
const NON_DISTINTIVE = new Set([
  'spa',
  'srl',
  'srls',
  'sas',
  'snc',
  'sc',
  'scarl',
  'ltd',
  'inc',
  'llc',
  'plc',
  'gmbh',
  'the',
  'di',
  'da',
  'de',
  'del',
  'della',
  'san',
  'santa',
]);

function senzaAccenti(testo: string): string {
  return testo
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * La parola su cui si giudica la pertinenza, o `null` se non ce n'è una.
 *
 * Almeno tre caratteri: sotto, è una preposizione o un'iniziale e comparirebbe
 * ovunque.
 */
export function parolaDistintiva(nome: string): string | null {
  for (const parola of senzaAccenti(nome).split(/[^a-z0-9]+/)) {
    if (parola.length >= 3 && !NON_DISTINTIVE.has(parola)) return parola;
  }
  return null;
}

/**
 * `true` se il testo trovato parla davvero di quell'esercente.
 *
 * Senza una parola distintiva si risponde `false`: non si può giudicare, e in
 * dubbio si scarta. È la stessa direzione di `sembraAttivita` — fallire chiuso
 * costa una classificazione a mano, fallire aperto costa un numero sbagliato
 * che sembra giusto.
 */
export function pertinente(nome: string, testoTrovato: string): boolean {
  const parola = parolaDistintiva(nome);
  if (parola === null) return false;
  return senzaAccenti(testoTrovato).includes(parola);
}
