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
  abbonamento: boolean;
  motivo: string;
  sicuro: boolean;
};

export type EsitoInterpretazione = { proposta: Proposta } | { scarto: string };

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
    return { scarto: `manca "etichetta" — campi trovati: ${Object.keys(p).join(', ') || 'nessuno'}` };
  }
  if (nome === null) return { scarto: `«${etichettaGrezza}» senza "nome"` };
  if (categoria === null) return { scarto: `«${etichettaGrezza}» senza "categoria"` };

  // L'etichetta deve corrispondere a una di quelle inviate, o si creerebbe un
  // alias per un testo che non compare in nessun movimento. Il confronto passa
  // però dalla forma normalizzata: un modello che restituisce `Sumup *bar Job`
  // invece di `Sumup  *bar Job` ha risposto bene, ha solo compattato uno spazio.
  const originale = lotto.find(
    (e) => normalizzaEtichetta(e) === normalizzaEtichetta(etichettaGrezza),
  );
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
