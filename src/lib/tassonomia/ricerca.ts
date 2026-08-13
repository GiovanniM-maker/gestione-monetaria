import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { comeArray } from '@/lib/enablebanking/redact';
import { interrogazione, motivoDelRifiuto, pertinente, type Rifiuto } from './regole-ricerca';

/**
 * Andare a prendere quello che il mondo sa di un esercente.
 *
 * ---------------------------------------------------------------------------
 * Il problema, misurato
 * ---------------------------------------------------------------------------
 * `Bruno Spa Modica` è un rivenditore di elettronica. La banca manda solo quel
 * nome, il modello non ha modo di saperlo, e in Fase 4 — su cento proposte —
 * ha indovinato: `casa`/`essenziale`, con la motivazione _«importo alto
 * suggerisce spesa casa»_. Su `Aspit` ha inventato _«associazione
 * bar/ristorazione in Emilia»_ per un'azienda di trasporti.
 *
 * `essenziale` è la classe che più distorce la metrica principale, e un errore
 * lì non si vede: il numero resta plausibile. Un umano con un motore di ricerca
 * risolve in dieci secondi. L'informazione **esiste fuori**.
 *
 * ---------------------------------------------------------------------------
 * Cosa esce, e cosa no
 * ---------------------------------------------------------------------------
 * Il nome dell'esercente. Nient'altro, mai. Le due difese sono in due posti
 * diversi perché rispondono a due domande diverse:
 *
 * - **chi** può essere cercato → `v_esercenti_da_cercare`, che include solo i
 *   nomi garantiti dalla carta. Il filtro sta nella vista, non qui, perché una
 *   vista si interroga da molti posti;
 * - **cosa** viene scritto nell'interrogazione → `regole-ricerca.ts`, l'ultimo
 *   controllo prima della rete.
 *
 * ---------------------------------------------------------------------------
 * Il risultato è una fonte, non una verità
 * ---------------------------------------------------------------------------
 * Si conserva il testo trovato **e l'URL da cui viene**. Senza la fonte, fra un
 * anno, una classificazione strana sarebbe indistinguibile da un'invenzione del
 * modello — ed è la distinzione che questo modulo esiste per creare.
 */

const URL_RICERCA = 'https://api.search.brave.com/res/v1/web/search';

/** Quanti risultati leggere. Tre bastano a capire che negozio è; dieci sono rumore. */
const RISULTATI = 3;

/** Oltre questa lunghezza il testo trovato si taglia: al modello serve un indizio, non una pagina. */
const LIMITE_TESTO = 600;

/**
 * Distanza fra due richieste.
 *
 * Il piano gratuito di Brave concede **una richiesta al secondo**
 * (`rate_limit: 1`), e non e' una quota giornaliera: e' un limite istantaneo.
 * Alla seconda chiamata sparata subito dopo la prima risponde 429 e la fetta si
 * ferma dopo due esercenti — che e' esattamente com'e' andata al primo giro
 * vero.
 *
 * 1.100 ms e non 1.000: il limite si misura sull'arrivo al loro server, non
 * sulla partenza dal nostro, e cento millisecondi di margine costano nulla
 * mentre un 429 costa l'intera fetta.
 */
const PAUSA_MS = 1_100;

/**
 * Quanto puo' durare una fetta.
 *
 * Non e' il tetto della funzione, e' molto piu' corto: **la risposta deve
 * tornare al browser**. Con 90 secondi di budget il primo giro vero ha cercato
 * e salvato 56 esercenti, poi la risposta non e' arrivata e il browser ha detto
 * «Load failed» — il lavoro c'era, il resoconto no. E un'operazione di cui non
 * si vede l'esito e' un'operazione di cui non ci si fida.
 *
 * Quaranta secondi sono una fetta che torna sempre. A cicliare e' il browser,
 * come gia' fa col backfill: e' lo stesso schema, e non c'era ragione di
 * inventarne un altro.
 */
const BUDGET_MS = 40_000;

/** Quante volte riprovare dopo un 429 prima di arrendersi. */
const RITENTATIVI = 2;

const attendi = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class RicercaNonConfigurata extends Error {}
export class ErroreRicerca extends Error {}
/** Il limite di frequenza, che si supera aspettando e non arrendendosi. */
export class TroppoVeloce extends ErroreRicerca {}

function chiave(): string {
  const valore = process.env['SEARCH_API_KEY'];
  if (valore === undefined || valore.trim() === '') {
    throw new RicercaNonConfigurata(
      'SEARCH_API_KEY non è impostata su questo ambiente. Senza, la classificazione continua a ' +
        'funzionare ma il modello torna a indovinare sugli esercenti mai visti.',
    );
  }
  return valore.trim();
}

/** `true` se la chiave c'è: serve alla UI per dire perché un bottone non fa niente. */
export function ricercaConfigurata(): boolean {
  const valore = process.env['SEARCH_API_KEY'];
  return valore !== undefined && valore.trim() !== '';
}

export type Ritrovamento = {
  /** Il testo trovato, già troncato. */
  descrizione: string;
  /** Da dove viene. Senza questo il testo non è verificabile. */
  fonte: string;
};

/**
 * Cerca un nome e restituisce cosa dice il mondo, o `null`.
 *
 * `null` ha due significati che il chiamante deve distinguere solo per i log:
 * il nome non poteva uscire, oppure è uscito e non ha trovato niente. In
 * entrambi i casi il risultato per il database è lo stesso — si è cercato, non
 * si sa — ed è per questo che `salva_ricerca` scrive `cercato_at` comunque.
 */
export async function cercaSulMondo(
  nome: string,
): Promise<{ ritrovamento: Ritrovamento | null; rifiuto: Rifiuto | null }> {
  const rifiuto = motivoDelRifiuto(nome);
  const query = interrogazione(nome);
  if (query === null) return { ritrovamento: null, rifiuto };

  const indirizzo = new URL(URL_RICERCA);
  indirizzo.searchParams.set('q', query);
  indirizzo.searchParams.set('count', String(RISULTATI));
  // Il paese e la lingua non sono dati dell'utente: sono la configurazione
  // dell'applicazione, fissata in `env.ts` come il fuso e la valuta. Servono
  // perché «Bruno Spa» in italiano e in inglese trovano cose diverse.
  indirizzo.searchParams.set('country', 'IT');
  indirizzo.searchParams.set('search_lang', 'it');

  const risposta = await fetch(indirizzo, {
    headers: {
      Accept: 'application/json',
      // Niente `Accept-Encoding` a mano: `fetch` lo imposta da solo e
      // decomprime la risposta. Scriverlo qui rischia di disattivare quella
      // decompressione automatica, e il corpo arriverebbe come byte illeggibili
      // — trovato provando con `curl`, dove succede davvero.
      'X-Subscription-Token': chiave(),
    },
    cache: 'no-store',
  });

  if (risposta.status === 429) {
    // Il limite e' istantaneo, quindi aspettare basta: non serve arrendersi.
    // `ErroreRicerca` con questo messaggio dice a chi chiama che vale la pena
    // riprovare, invece di far sembrare esaurita la quota mensile.
    throw new TroppoVeloce('Una richiesta al secondo: rallento e riprovo.');
  }

  if (!risposta.ok) {
    const dettaglio = await risposta.text().catch(() => '');
    throw new ErroreRicerca(`Ricerca fallita con ${risposta.status}: ${dettaglio.slice(0, 300)}`);
  }

  // La forma della risposta non si dà per scontata, come per Enable Banking e
  // per OpenRouter: un campo assente deve produrre «non trovato», non un
  // `undefined` che viaggia fino a rompere qualcosa tre funzioni più in là.
  const dati = (await risposta.json()) as { web?: { results?: unknown } };
  const risultati = Array.isArray(dati.web?.results) ? dati.web.results : [];

  const pezzi: string[] = [];
  let fonte: string | null = null;

  for (const grezzo of risultati.slice(0, RISULTATI)) {
    const r = grezzo as { title?: unknown; description?: unknown; url?: unknown };
    const titolo = typeof r.title === 'string' ? ripulisci(r.title) : '';
    const testo = typeof r.description === 'string' ? ripulisci(r.description) : '';
    if (titolo === '' && testo === '') continue;

    if (fonte === null && typeof r.url === 'string') fonte = r.url;
    pezzi.push([titolo, testo].filter((p) => p !== '').join(' — '));
  }

  if (pezzi.length === 0 || fonte === null) return { ritrovamento: null, rifiuto: null };

  // Il motore risponde comunque qualcosa: su `Aspit Campogalliano` ha
  // restituito i pedaggi del casello di Campogalliano, che è vero e non c'entra
  // niente. Un risultato non pertinente dato al modello diventa un fatto, e gli
  // toglie il dubbio invece di dargli un'informazione.
  const testo = pezzi.join('\n');
  if (!pertinente(nome, testo)) return { ritrovamento: null, rifiuto: null };

  return {
    ritrovamento: { descrizione: testo.slice(0, LIMITE_TESTO), fonte },
    rifiuto: null,
  };
}

/**
 * Toglie i marcatori di evidenziazione e normalizza gli spazi.
 *
 * Brave restituisce il testo con dei tag intorno alle parole cercate. Lasciarli
 * significherebbe darli in pasto al modello, che li leggerebbe come contenuto.
 */
function ripulisci(testo: string): string {
  return testo
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export type EsitoArricchimento = {
  esaminati: number;
  trovati: number;
  vuoti: number;
  /** Nomi che la regola 8b non ha lasciato uscire, con il motivo. */
  trattenuti: { esercente: string; motivo: Rifiuto }[];
  rimasti: number;
  errore: string | null;
};

/**
 * Cerca i prossimi esercenti mai cercati, dal più costoso.
 *
 * A fette come tutto il resto: `v_esercenti_da_cercare` è ordinata per spesa,
 * quindi la prima fetta è quella che sposta di più la metrica. Chi chiama
 * rilancia finché `rimasti` è zero — lo stesso schema del backfill e delle
 * proposte, che è già il modo in cui questa applicazione fa le cose lunghe.
 */
export async function arricchisciEsercenti(limite = 80): Promise<EsitoArricchimento> {
  const supabase = await createSupabaseServerClient();
  const esito: EsitoArricchimento = {
    esaminati: 0,
    trovati: 0,
    vuoti: 0,
    trattenuti: [],
    rimasti: 0,
    errore: null,
  };

  const scadenza = Date.now() + BUDGET_MS;

  const { data, error } = await supabase
    .from('v_esercenti_da_cercare')
    .select('merchant_id, esercente, movimenti, speso')
    .limit(limite);

  if (error !== null) throw new Error(`Lettura esercenti da cercare fallita: ${error.message}`);

  const da = comeArray<{ merchant_id: string; esercente: string }>(data);

  for (const [indice, m] of da.entries()) {
    if (Date.now() >= scadenza) {
      esito.errore = 'Budget di tempo esaurito. Rilancia: si riprende da dove si era arrivati.';
      break;
    }
    // Il passo, non prima del primo: un secondo di attesa iniziale sarebbe un
    // secondo regalato a ogni fetta.
    if (indice > 0) await attendi(PAUSA_MS);

    esito.esaminati += 1;
    try {
      const { ritrovamento, rifiuto } = await conRitentativi(() => cercaSulMondo(m.esercente));

      if (rifiuto !== null) {
        esito.trattenuti.push({ esercente: m.esercente, motivo: rifiuto });
      } else if (ritrovamento !== null) {
        esito.trovati += 1;
      } else {
        esito.vuoti += 1;
      }

      // Si scrive **sempre**, anche a mani vuote e anche quando la regola 8b ha
      // trattenuto il nome: `cercato_at` significa «questa strada è stata
      // provata». Senza, l'esercente tornerebbe nella lista a ogni giro, per
      // sempre, e la fetta successiva ripescherebbe gli stessi nomi.
      await supabase.rpc('salva_ricerca', {
        p_merchant_id: m.merchant_id,
        p_descrizione: ritrovamento?.descrizione ?? null,
        p_fonte: ritrovamento?.fonte ?? null,
      });
    } catch (errore) {
      // Un errore di rete o una quota esaurita fermano la fetta ma non la
      // annullano: quello che è già stato scritto resta, e il giro dopo
      // riprende da dove si era arrivati.
      esito.errore = errore instanceof Error ? errore.message : String(errore);
      break;
    }
  }

  const { count } = await supabase
    .from('v_esercenti_da_cercare')
    .select('merchant_id', { count: 'exact', head: true });
  esito.rimasti = count ?? 0;

  return esito;
}

/**
 * Riprova quando il limite di frequenza scatta comunque.
 *
 * Il passo fisso non basta sempre: due invocazioni ravvicinate della stessa
 * fetta, o un ritardo di rete che accorcia la distanza percepita dal loro
 * server, e il 429 arriva lo stesso. Aspettare due secondi lo risolve, e
 * fermare l'intera fetta per un limite che dura un secondo sarebbe
 * sproporzionato.
 *
 * Solo per `TroppoVeloce`: un 401 o un 403 non migliorano riprovando, e
 * insistere su una chiave sbagliata e' solo un modo lento di fallire.
 */
async function conRitentativi<T>(azione: () => Promise<T>): Promise<T> {
  for (let tentativo = 0; ; tentativo += 1) {
    try {
      return await azione();
    } catch (errore) {
      if (!(errore instanceof TroppoVeloce) || tentativo >= RITENTATIVI) throw errore;
      await attendi(2_000 * (tentativo + 1));
    }
  }
}
