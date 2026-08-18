import { createHash } from 'node:crypto';
import { converti, formattaCentesimi, parseCentesimi } from '@/lib/money';

/**
 * Trasformazione di un payload grezzo Enable Banking in un movimento
 * normalizzato. Funzione pura: nessun accesso a rete o database, così ogni
 * regola qui dentro è verificabile con un test invece che con un backfill.
 *
 * È il punto in cui si stabilisce il segno degli importi, e sbagliarlo
 * falserebbe ogni numero dell'applicazione in un modo che sembra plausibile.
 */

export type ContestoNormalizzazione = {
  /** Valuta del conto, usata quando il payload non la dichiara. */
  valutaConto: string;
  /**
   * Nomi normalizzati di tutto cio' che e' un conto dell'utente: sia i conti
   * collegati, sia le controparti che l'utente ha dichiarato essere sue.
   *
   * Le seconde non sono deducibili da nessun dato: un bonifico verso un proprio
   * conto presso un'altra banca e' identico a un bonifico a un terzo, e l'altro
   * lato non esiste nei nostri dati. L'unica fonte e' l'utente.
   */
  nomiContiPropri: readonly string[];
};

export type MovimentoNormalizzato = {
  external_id: string | null;
  dedupe_key: string | null;
  booking_date: string;
  value_date: string | null;
  amount: string;
  currency: string;
  amount_eur: string | null;
  fx_rate: string | null;
  fx_date: string | null;
  raw_description: string | null;
  counterparty_raw: string | null;
  status: 'pending' | 'booked';
  /**
   * Il codice della banca, salvato tale e quale.
   *
   * Non serve alla normalizzazione: serve a sapere se dall'altra parte del
   * movimento c'e' un esercente o una persona, che e' cio' che decide se
   * quell'etichetta puo' uscire verso un LLM (regola 8). E' un dato che la
   * banca dava da sempre e che buttavamo via.
   */
  bank_code: string | null;
  is_transfer: boolean;
  is_refund: boolean;
};

function testo(valore: unknown): string | null {
  return typeof valore === 'string' && valore.trim() !== '' ? valore.trim() : null;
}

function giorno(valore: unknown): string | null {
  const t = testo(valore);
  return t !== null && /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

/** Confronto fra nomi: minuscole, spazi compattati. */
export function normalizzaNome(valore: string): string {
  return valore.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Rimuove dalla causale gli identificativi tecnici che Revolut accoda.
 *
 * Senza questo, `"To EUR MB:b260c88e-…"` e `"To EUR MB:ef475d8d-…"` sono due
 * stringhe diverse: lo stesso identico spostamento genererebbe due controparti
 * distinte, e nessuna delle due verrebbe riconosciuta come giroconto.
 */
export function ripulisciCausale(causale: string): string {
  return causale
    .replace(/\s+MB:[0-9a-f-]{8,}\s*$/i, '')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Riconosce i giroconti fra conti propri.
 *
 * Il codice `TRANSFER` da solo NON basta: comprende anche i bonifici verso
 * persone fisiche, che sono uscite reali. Nei dati osservati `"To Annachiara F"`
 * e `"To EUR"` hanno lo stesso codice e la stessa forma, e solo il secondo è un
 * giroconto. Il discriminante è cosa c'è dopo `To`/`From`: una sigla di valuta
 * — i pocket Revolut — oppure il nome di un conto che è nostro.
 */
export function riconosciGiroconto(
  payload: Record<string, unknown>,
  nomiContiPropri: readonly string[],
): boolean {
  const codice = testo(
    (payload['bank_transaction_code'] as Record<string, unknown> | undefined)?.['code'],
  );

  // Un cambio valuta e' uno spostamento fra due saldi dello stesso utente: non
  // esiste una controparte, quindi non c'e' niente da interpretare e il codice
  // basta da solo. E' la stessa natura del pocket — di cui registriamo un lato
  // solo — scritta dalla banca in un altro modo: `EXCHANGE` con causale
  // «Exchanged to EUR» invece di `TRANSFER` con «To EUR».
  //
  // Il controllo sta sul **codice** e non sulla causale di proposito: due
  // «Exchanged to EUR» da 250,72 e 242,07 € risultavano entrate perche' la riga
  // qui sotto usciva prima di guardarle, e una regola che dipende da come la
  // banca scrive una frase si rompe alla prima variante — mentre il codice e'
  // un dato strutturale, che e' il motivo per cui i riferimenti condivisi
  // battono il confronto fra causali.
  if (codice === 'EXCHANGE') return true;

  if (codice !== 'TRANSFER') return false;

  // La controparte dichiarata vale a prescindere dalla forma della causale:
  // e' il caso dei bonifici verso un proprio conto presso un altro istituto,
  // dove la causale puo' non dire niente di utile.
  //
  // La controparte e' UNA sola e dipende dalla direzione: su un'uscita e' il
  // creditore, su un'entrata il debitore. Guardarle entrambe sarebbe un errore
  // grave e silenzioso: su ogni uscita il debitore e' l'intestatario del conto,
  // quindi dichiarare il proprio nome marcherebbe come giroconto anche un
  // bonifico a un terzo, cancellando spese reali.
  const verso = testo(payload['credit_debit_indicator'])?.toUpperCase();
  const ruoloControparte = verso === 'CRDT' ? 'debtor' : 'creditor';
  const controparte = testo(
    (payload[ruoloControparte] as Record<string, unknown> | undefined)?.['name'],
  );
  if (controparte !== null && nomiContiPropri.includes(normalizzaNome(controparte))) {
    return true;
  }

  const causali = payload['remittance_information'];
  const prima = Array.isArray(causali) ? testo(causali[0]) : null;
  if (prima === null) return false;

  const trovato = /^(to|from)\s+(.+)$/i.exec(ripulisciCausale(prima));
  if (trovato === null) return false;

  const destinazione = (trovato[2] ?? '').trim();

  // Pocket in valuta: "To EUR", "From USD".
  if (/^[A-Z]{3}$/.test(destinazione)) return true;

  return nomiContiPropri.includes(normalizzaNome(destinazione));
}

function chiaveFallback(
  accountId: string,
  bookingDate: string,
  importo: string,
  descrizione: string | null,
): string {
  return (
    createHash('sha256')
      // Separatore NUL, scritto come sequenza di escape e non come byte
      // vero. Nel sorgente c'era il carattere letterale, che rende il file
      // "binario" per grep e sopravvive male a qualunque strumento che
      // tocchi il testo — e se sparisse in silenzio cambierebbero tutte le
      // chiavi di deduplica dei movimenti senza `entry_reference`.
      // La scelta del NUL resta giusta: non puo' comparire dentro un campo,
      // quindi due componenti diverse non possono mai produrre la stessa
      // concatenazione.
      .update([accountId, bookingDate, importo, descrizione ?? ''].join('\u0000'))
      .digest('hex')
  );
}

/**
 * I codici con cui la banca scrive un accredito su carta.
 *
 * Erano uno solo, ed era mezzo elenco: il 26 giugno 2026 un rimborso di
 * `Booking.com` da **506,63 €** e' arrivato con `CARD_REFUND`, ha passato il
 * controllo su `CARD_CREDIT` e ha finito nelle **entrate** — cioe' e' stato
 * contato come reddito. Un rimborso non e' reddito: e' una spesa annullata, ed
 * e' precisamente per questo che `is_refund` esiste.
 *
 * Un insieme e non un `||`: il prossimo codice che la banca inventa si aggiunge
 * qui, in un posto solo, e non c'e' modo di scriverne uno e dimenticarne
 * l'altro.
 */
const CODICI_RIMBORSO: ReadonlySet<string> = new Set(['CARD_CREDIT', 'CARD_REFUND']);

export class PayloadNonNormalizzabile extends Error {}

export function normalizzaMovimento(
  payload: Record<string, unknown>,
  accountId: string,
  contesto: ContestoNormalizzazione,
): MovimentoNormalizzato {
  const importo = payload['transaction_amount'] as Record<string, unknown> | undefined;
  const grezzo = testo(importo?.['amount']);
  if (grezzo === null) {
    throw new PayloadNonNormalizzabile('Movimento senza transaction_amount.amount');
  }

  const bookingDate =
    giorno(payload['booking_date']) ??
    giorno(payload['value_date']) ??
    giorno(payload['transaction_date']);
  if (bookingDate === null) {
    throw new PayloadNonNormalizzabile('Movimento senza alcuna data utilizzabile');
  }

  // Il segno. L'API restituisce sempre importi positivi: DBIT e' un'uscita,
  // CRDT un'entrata. In assenza dell'indicatore si assume uscita, perche' e' il
  // caso dominante e perche' sovrastimare le spese e' meno dannoso che
  // nasconderle.
  const indicatore = testo(payload['credit_debit_indicator'])?.toUpperCase();
  const centesimiAssoluti = parseCentesimi(grezzo);
  const positivi = centesimiAssoluti < 0n ? -centesimiAssoluti : centesimiAssoluti;
  const centesimi = indicatore === 'CRDT' ? positivi : -positivi;

  const valuta = (testo(importo?.['currency']) ?? contesto.valutaConto).toUpperCase();

  // Conversione FX: una volta sola, qui. Sui conti in euro il tasso e' 1 per
  // definizione. Su una valuta diversa, senza un tasso non si inventa un
  // numero: `amount_eur` resta null e il movimento e' visibilmente incompleto,
  // che e' molto meglio di un importo plausibile e sbagliato.
  const tassoGrezzo = testo(payload['exchange_rate']);
  const tasso = valuta === 'EUR' ? '1' : tassoGrezzo;
  const centesimiEur = tasso === null ? null : converti(centesimi, tasso);

  const causali = payload['remittance_information'];
  const primaCausale = Array.isArray(causali) ? testo(causali[0]) : null;
  const creditore = testo((payload['creditor'] as Record<string, unknown> | undefined)?.['name']);
  const debitore = testo((payload['debtor'] as Record<string, unknown> | undefined)?.['name']);

  const statoGrezzo = testo(payload['status'])?.toUpperCase();
  const stato = statoGrezzo === 'PDNG' ? 'pending' : 'booked';

  const codice = testo(
    (payload['bank_transaction_code'] as Record<string, unknown> | undefined)?.['code'],
  );

  const externalId = testo(payload['entry_reference']);
  const importoFirmato = formattaCentesimi(centesimi);
  const descrizione = primaCausale ?? creditore;

  return {
    external_id: externalId,
    dedupe_key:
      externalId === null
        ? chiaveFallback(accountId, bookingDate, importoFirmato, descrizione)
        : null,
    booking_date: bookingDate,
    // Le PDNG hanno value_date a null: e' un dato assente, non zero.
    value_date: giorno(payload['value_date']),
    amount: importoFirmato,
    currency: valuta,
    amount_eur: centesimiEur === null ? null : formattaCentesimi(centesimiEur),
    fx_rate: tasso,
    fx_date: tasso === null ? null : bookingDate,
    raw_description: descrizione,
    // La controparte e' il creditore per le uscite, il debitore per le entrate.
    counterparty_raw: centesimi < 0n ? creditore : (debitore ?? creditore),
    status: stato,
    bank_code: codice,
    is_transfer: riconosciGiroconto(payload, contesto.nomiContiPropri),
    is_refund: indicatore === 'CRDT' && codice !== null && CODICI_RIMBORSO.has(codice),
  };
}
