import 'server-only';

/**
 * Client minimo verso il modello, attraverso **OpenRouter**.
 *
 * Scritto a mano invece di installare un SDK, per la stessa ragione per cui il
 * JWT di Enable Banking è firmato con `node:crypto`: qui serve una sola
 * chiamata, e una dipendenza in più va giustificata da ciò che fa risparmiare.
 *
 * Il nome del file è neutro di proposito. Il fornitore è una scelta che può
 * cambiare — è già cambiata una volta, da Anthropic diretta a OpenRouter — e
 * il resto dell'applicazione non deve accorgersene.
 *
 * **Server-only, senza eccezioni** (regola 3): la chiave non deve mai finire in
 * un bundle client, e `import 'server-only'` fa fallire la build se qualcuno ci
 * prova per sbaglio.
 */

const URL_CHAT = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * Il modello, sovrascrivibile con `OPENROUTER_MODEL` senza toccare il codice:
 * gli slug di OpenRouter cambiano nel tempo e aggiornarne uno non deve
 * richiedere un deploy.
 *
 * Il predefinito e' un modello **piccolo**, e non e' un risparmio a scapito
 * della qualita': e' la taglia giusta per il compito.
 *
 * Qui non si scrive niente. Si legge un nome di esercente di tre parole, si
 * sceglie una voce da un elenco chiuso di trentaquattro categorie e si
 * risponde con un oggetto a otto campi. Non serve un modello da ragionamento
 * lungo, serve uno che non sbagli il formato — e su quello i piccoli sono
 * ormai affidabili quanto i grandi.
 *
 * Se le proposte risultassero scadenti si cambia `OPENROUTER_MODEL` e si
 * rilancia: le proposte vecchie restano marcate `ai` e non confermate, quindi
 * si vede subito se il modello nuovo fa meglio.
 */
const MODELLO_PREDEFINITO = 'anthropic/claude-haiku-4.5';

export class ConfigurazioneAiMancante extends Error {}
export class ErroreAi extends Error {}

function chiave(): string {
  const valore = process.env['OPENROUTER_API_KEY'];
  if (valore === undefined || valore.trim() === '') {
    throw new ConfigurazioneAiMancante(
      'OPENROUTER_API_KEY non è impostata su questo ambiente. Va aggiunta fra le variabili del progetto su Vercel, mai nel repository.',
    );
  }
  return valore.trim();
}

export function modelloInUso(): string {
  const scelto = process.env['OPENROUTER_MODEL'];
  return scelto === undefined || scelto.trim() === '' ? MODELLO_PREDEFINITO : scelto.trim();
}

/** `true` se la chiave c'è: serve alla UI per dire perché un bottone non funziona. */
export function aiConfigurata(): boolean {
  const valore = process.env['OPENROUTER_API_KEY'];
  return valore !== undefined && valore.trim() !== '';
}

export type RichiestaAi = {
  system: string;
  prompt: string;
  maxTokens?: number;
};

export type RispostaAi = {
  testo: string;
  /**
   * Quanto e' costata, quando il fornitore lo dice.
   *
   * Serve a rispondere con un numero alla domanda "quanto stiamo spendendo",
   * invece che con una stima. Sono campi opzionali di proposito: se OpenRouter
   * smettesse di restituirli, il conteggio sparisce ma la classificazione
   * continua a funzionare.
   */
  token: number | null;
  costo: number | null;
};

/** Chiede una risposta al modello e restituisce il testo, senza interpretarlo. */
export async function chiediAlModello(richiesta: RichiestaAi): Promise<RispostaAi> {
  const risposta = await fetch(URL_CHAT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${chiave()}`,
    },
    body: JSON.stringify({
      model: modelloInUso(),
      max_tokens: richiesta.maxTokens ?? 4096,
      // Classificare non è scrivere: si vuole la stessa risposta a ogni giro,
      // o due esecuzioni sugli stessi esercenti darebbero categorie diverse.
      temperature: 0,
      messages: [
        { role: 'system', content: richiesta.system },
        { role: 'user', content: richiesta.prompt },
      ],
      // Chiede a OpenRouter di allegare il conteggio dei token e il costo.
      usage: { include: true },
    }),
    cache: 'no-store',
  });

  if (!risposta.ok) {
    const corpo = await risposta.text().catch(() => '');
    throw new ErroreAi(
      `OpenRouter ha risposto ${risposta.status} per il modello «${modelloInUso()}»: ${corpo.slice(0, 500)}`,
    );
  }

  // La forma della risposta non si dà per scontata, come per Enable Banking:
  // un campo assente deve produrre un errore leggibile, non un `undefined` che
  // viaggia fino a rompere qualcosa tre funzioni più in là.
  const dati = (await risposta.json()) as {
    choices?: unknown;
    error?: unknown;
    usage?: { total_tokens?: unknown; cost?: unknown };
  };

  // OpenRouter può rispondere 200 con un errore nel corpo, quando è il
  // fornitore a monte a rifiutare. Senza questo controllo si leggerebbe una
  // lista di scelte vuota e si direbbe "risposta senza testo", nascondendo il
  // motivo vero.
  if (dati.error !== undefined && dati.error !== null) {
    const messaggio = (dati.error as { message?: unknown }).message;
    throw new ErroreAi(
      `OpenRouter: ${typeof messaggio === 'string' ? messaggio : JSON.stringify(dati.error).slice(0, 300)}`,
    );
  }

  const scelte = Array.isArray(dati.choices) ? dati.choices : [];
  const prima = scelte[0] as { message?: { content?: unknown } } | undefined;
  const testo = prima?.message?.content;

  if (typeof testo !== 'string' || testo.trim() === '') {
    throw new ErroreAi('Risposta del modello senza testo.');
  }

  const numero = (v: unknown): number | null => (typeof v === 'number' && isFinite(v) ? v : null);

  return {
    testo,
    token: numero(dati.usage?.total_tokens),
    costo: numero(dati.usage?.cost),
  };
}

/**
 * Estrae il primo array JSON dal testo.
 *
 * I modelli a volte incorniciano il JSON con una frase o un blocco markdown.
 * Pretendere una risposta perfettamente pulita renderebbe fragile una cosa che
 * non ha motivo di esserlo.
 */
export function estraiArrayJson(testo: string): unknown[] {
  const inizio = testo.indexOf('[');
  const fine = testo.lastIndexOf(']');
  if (inizio === -1 || fine <= inizio) {
    throw new ErroreAi(`Nella risposta non c'è un array JSON: ${testo.slice(0, 200)}`);
  }
  try {
    const valore: unknown = JSON.parse(testo.slice(inizio, fine + 1));
    if (!Array.isArray(valore)) throw new Error('non è un array');
    return valore;
  } catch (errore) {
    throw new ErroreAi(
      `JSON non interpretabile: ${errore instanceof Error ? errore.message : String(errore)}`,
    );
  }
}
