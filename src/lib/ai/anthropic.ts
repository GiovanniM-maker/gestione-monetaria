import 'server-only';

/**
 * Client minimo per l'API Anthropic.
 *
 * Scritto a mano invece di installare l'SDK, per la stessa ragione per cui il
 * JWT di Enable Banking è firmato con `node:crypto`: qui serve una sola
 * chiamata, e una dipendenza in più va giustificata da ciò che fa risparmiare.
 *
 * **Server-only, senza eccezioni** (regola 3): la chiave non deve mai finire
 * in un bundle client, e `import 'server-only'` fa fallire la build se qualcuno
 * ci prova per sbaglio.
 */

const MODELLO = 'claude-sonnet-5';
const URL_MESSAGGI = 'https://api.anthropic.com/v1/messages';

export class ConfigurazioneAiMancante extends Error {}
export class ErroreAi extends Error {}

function chiave(): string {
  const valore = process.env['ANTHROPIC_API_KEY'];
  if (valore === undefined || valore.trim() === '') {
    throw new ConfigurazioneAiMancante(
      'ANTHROPIC_API_KEY non è impostata su questo ambiente. Va aggiunta fra le variabili del progetto su Vercel, non nel repository.',
    );
  }
  return valore.trim();
}

/** `true` se la chiave c'è: serve alla UI per dire perché un bottone non funziona. */
export function aiConfigurata(): boolean {
  const valore = process.env['ANTHROPIC_API_KEY'];
  return valore !== undefined && valore.trim() !== '';
}

export type RichiestaAi = {
  system: string;
  prompt: string;
  maxTokens?: number;
};

/** Chiede una risposta al modello e restituisce il testo, senza interpretarlo. */
export async function chiediAlModello(richiesta: RichiestaAi): Promise<string> {
  const risposta = await fetch(URL_MESSAGGI, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': chiave(),
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODELLO,
      max_tokens: richiesta.maxTokens ?? 4096,
      system: richiesta.system,
      messages: [{ role: 'user', content: richiesta.prompt }],
    }),
    cache: 'no-store',
  });

  if (!risposta.ok) {
    const corpo = await risposta.text().catch(() => '');
    throw new ErroreAi(`Anthropic ha risposto ${risposta.status}: ${corpo.slice(0, 500)}`);
  }

  // La forma della risposta non si dà per scontata, come per Enable Banking:
  // un campo assente deve produrre un errore leggibile, non un `undefined` che
  // viaggia fino a rompere qualcosa tre funzioni più in là.
  const dati = (await risposta.json()) as { content?: unknown };
  const blocchi = Array.isArray(dati.content) ? dati.content : [];
  const testo = blocchi
    .map((b) => (b as { type?: unknown; text?: unknown }))
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('');

  if (testo.trim() === '') throw new ErroreAi('Risposta del modello senza testo.');
  return testo;
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
