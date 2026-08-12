import { normalizzaEtichetta } from './abbinamento';
import type { Context, Discretion } from '@/lib/db/types';

/**
 * Traduce una voce della risposta del modello in una proposta utilizzabile.
 *
 * Modulo a parte, senza `server-only` e senza accessi al database, per una
 * ragione concreta: la prima versione, alla prima prova sul campo, ha bocciato
 * **quindici risposte su quindici** — e non era verificabile senza spendere
 * una chiamata vera. Una funzione pura si prova con un test.
 *
 * Due principi, e sono opposti fra loro di proposito:
 *
 * 1. **Generosa su ciò che accetta.** Un modello può rispondere
 *    `discrezionalità` con l'accento, `category` in inglese, o ricopiare
 *    l'etichetta con gli spazi compattati. Sono variazioni sulla forma, non sul
 *    contenuto: rifiutarle butta una risposta giusta.
 * 2. **Severa su ciò che passa.** Una categoria inesistente o una
 *    discrezionalità inventata finirebbero dritte nella metrica principale, e
 *    lì non si accetta niente che non sia nell'elenco.
 *
 * E quando rifiuta **dice perché**. Contare un errore senza descriverlo è un
 * modo elegante di nasconderlo: «15 scartate» non permette di capire se la
 * colpa fosse del modello o della validazione.
 */

export const DISCREZIONALITA: readonly Discretion[] = [
  'essenziale',
  'investimento',
  'utile',
  'voluttuario',
];
export const CONTESTI: readonly Context[] = ['personale', 'business'];

export type Proposta = {
  etichetta: string;
  nome: string;
  categoria: string;
  discrezionalita: Discretion;
  contesto: Context;
  /**
   * La parte del nome che tornera' identica la prossima volta, quando c'e'.
   *
   * `Canva* I04731-63857386` ha un codice diverso a ogni addebito: un alias
   * sull'etichetta intera vale per quell'unico movimento e non riconoscera' mai
   * il prossimo. Con `canva` come frammento l'alias diventa `contains` e li
   * prende tutti, anche quelli che non sono ancora arrivati — che e' il punto
   * di avere una memoria delle risposte invece di una lista di eccezioni.
   */
  frammento: string | null;
  abbonamento: boolean;
  motivo: string;
  sicuro: boolean;
};

export type EsitoInterpretazione = { proposta: Proposta } | { scarto: string };

/**
 * Il frammento proposto, se è utilizzabile.
 *
 * Due condizioni, e servono entrambe. Deve essere **contenuto nell'etichetta**:
 * un frammento inventato genererebbe un alias che non abbina niente, o peggio
 * abbina altro. E deve essere **lungo almeno tre caratteri**: `contains` con
 * una o due lettere pesca mezzo database, e un esercente sbagliato sparisce
 * dentro un totale senza che nessuno se ne accorga.
 *
 * In dubbio restituisce `null`, e l'alias torna a essere sull'etichetta
 * intera: copre meno, ma non copre cose sbagliate.
 */
function frammentoValido(proposto: string | null, etichetta: string): string | null {
  if (proposto === null) return null;
  const f = normalizzaEtichetta(proposto);
  if (f.length < 3) return null;
  return normalizzaEtichetta(etichetta).includes(f) ? proposto.trim() : null;
}

/**
 * Ritrova quale etichetta inviata corrisponde a quella tornata dal modello.
 *
 * Due tentativi, in ordine di severità.
 *
 * 1. **Uguaglianza sulla forma normalizzata.** Copre il caso normale e le
 *    differenze di spaziatura o maiuscole.
 * 2. **Prefisso.** Copre il caso in cui il modello ricopi più del dovuto — è
 *    successo davvero: mandavo `- Canva* I04731-63857386 · 1 volte · -12.00
 *    EUR` chiedendo di ricopiare "l'etichetta", e ha ricopiato la riga intera.
 *    Aveva ragione lui: in una riga di testo non c'è niente che dica dove
 *    finisce il nome. Il prompt ora manda JSON, ma la difesa resta.
 *
 * A parità di prefisso vince il più lungo, che è il più specifico: fra
 * `Canva` e `Canva* I04731` per una risposta che comincia con entrambi, il
 * secondo identifica davvero il movimento.
 */
function ritrovaEtichetta(risposta: string, lotto: readonly string[]): string | undefined {
  const bersaglio = normalizzaEtichetta(risposta);

  const esatta = lotto.find((e) => normalizzaEtichetta(e) === bersaglio);
  if (esatta !== undefined) return esatta;

  return lotto
    .filter((e) => {
      const n = normalizzaEtichetta(e);
      return n !== '' && bersaglio.startsWith(n);
    })
    .sort((a, b) => normalizzaEtichetta(b).length - normalizzaEtichetta(a).length)[0];
}

export function interpretaProposta(
  grezza: unknown,
  slugValidi: ReadonlySet<string>,
  lotto: readonly string[],
): EsitoInterpretazione {
  if (grezza === null || typeof grezza !== 'object' || Array.isArray(grezza)) {
    return { scarto: `risposta che non è un oggetto: ${JSON.stringify(grezza).slice(0, 80)}` };
  }
  const p = grezza as Record<string, unknown>;

  /** Primo campo presente fra i nomi accettati. */
  const campo = (...nomi: readonly string[]): string | null => {
    for (const n of nomi) {
      const v = p[n];
      if (typeof v === 'string' && v.trim() !== '') return v.trim();
    }
    return null;
  };

  const vero = (...nomi: readonly string[]): boolean =>
    nomi.some((n) => p[n] === true || p[n] === 'true');

  const etichettaGrezza = campo('etichetta', 'label');
  const nome = campo('nome', 'name');
  const categoria = campo('categoria', 'category', 'categoria_slug');
  const discrezionalita = campo('discrezionalita', 'discrezionalità', 'discretion');
  const contesto = campo('contesto', 'context');

  if (etichettaGrezza === null) {
    return {
      scarto: `manca "etichetta" — campi trovati: ${Object.keys(p).join(', ') || 'nessuno'}`,
    };
  }
  if (nome === null) return { scarto: `«${etichettaGrezza}» senza "nome"` };
  if (categoria === null) return { scarto: `«${etichettaGrezza}» senza "categoria"` };

  // L'etichetta deve corrispondere a una di quelle inviate, o si creerebbe un
  // alias per un testo che non compare in nessun movimento. Il confronto passa
  // però dalla forma normalizzata: un modello che restituisce `Sumup *bar Job`
  // invece di `Sumup  *bar Job` ha risposto bene, ha solo compattato uno spazio.
  const originale = ritrovaEtichetta(etichettaGrezza, lotto);
  if (originale === undefined) {
    return { scarto: `«${etichettaGrezza}» non è fra le etichette inviate` };
  }
  if (!slugValidi.has(categoria)) {
    return { scarto: `«${originale}»: categoria inesistente «${categoria}»` };
  }
  if (discrezionalita === null || !DISCREZIONALITA.includes(discrezionalita as Discretion)) {
    return { scarto: `«${originale}»: discrezionalità non ammessa «${discrezionalita ?? '—'}»` };
  }
  if (contesto === null || !CONTESTI.includes(contesto as Context)) {
    return { scarto: `«${originale}»: contesto non ammesso «${contesto ?? '—'}»` };
  }

  return {
    proposta: {
      etichetta: originale,
      frammento: frammentoValido(campo('frammento', 'fragment'), originale),
      nome,
      categoria,
      discrezionalita: discrezionalita as Discretion,
      contesto: contesto as Context,
      abbonamento: vero('abbonamento', 'is_subscription', 'subscription'),
      motivo: campo('motivo', 'reason') ?? '',
      sicuro: vero('sicuro', 'confident', 'sure'),
    },
  };
}
