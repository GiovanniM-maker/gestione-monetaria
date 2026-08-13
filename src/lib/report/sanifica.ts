/**
 * Cosa del report può uscire verso un modello.
 *
 * ---------------------------------------------------------------------------
 * Il problema che questo file esiste per risolvere
 * ---------------------------------------------------------------------------
 * Le metriche contengono i nomi degli esercenti, e **un esercente può essere
 * una persona fisica**. Non è un caso teorico: nel database di questa
 * applicazione, fra le ricorrenze rilevate, ci sono `Sabrina Di Javadzade`,
 * `Laura Bovi`, `Cavallo Vincenzo`. Sono controparti di bonifici privati che
 * la Fase 4 ha correttamente registrato come esercenti, perché a un pagamento
 * ricorrente serve un nome.
 *
 * Mandarli a un modello violerebbe la **regola 8** tanto quanto mandarli in
 * Fase 4, e in un report sarebbe anche peggio: là uscivano per essere
 * classificati, qui uscirebbero per essere *raccontati*.
 *
 * ---------------------------------------------------------------------------
 * La regola è una sola, e sta già scritta
 * ---------------------------------------------------------------------------
 * Si riusa `sembraAttivita`, che è un **test positivo**: risponde `true` solo
 * se il nome dichiara un'attività commerciale — forma societaria, parola di
 * mestiere, dominio, cifre, prefisso di incasso. In dubbio risponde `false` e
 * il nome resta dentro.
 *
 * Riscrivere qui una seconda versione del filtro sarebbe il modo più diretto
 * per farne divergere una dall'altra, ed è dalla divergenza che nascono le
 * fughe. Il 12 agosto una regola scritta al contrario — «sembra una persona?»
 * invece di «sembra un'azienda?» — ha lasciato uscire davvero il nome di una
 * controparte.
 *
 * Chi non passa non viene **tolto**: viene sostituito con «un privato». Il
 * numero resta, il racconto resta possibile — «un bonifico a un privato di
 * 500 €» — e sparisce solo ciò che non deve uscire.
 */

import { sembraAttivita } from '@/lib/tassonomia/persone';

/** Come compare nel report un esercente che non può essere nominato. */
export const ANONIMO = 'un privato';

export type Sanificazione = {
  metriche: unknown;
  /** Quanti nomi sono stati sostituiti. Va riportato, non fatto in silenzio. */
  anonimizzati: number;
};

/**
 * Sostituisce i nomi che non dichiarano un'attività, ovunque compaiano.
 *
 * Cammina l'intera struttura invece di conoscerne la forma: una chiave nuova
 * aggiunta un domani alle metriche sarebbe coperta da subito, mentre un elenco
 * di percorsi da ripulire andrebbe aggiornato a mano — e il giorno in cui
 * qualcuno se ne dimentica è il giorno della fuga.
 */
export function sanificaMetriche(metriche: unknown): Sanificazione {
  let anonimizzati = 0;

  const cammina = (valore: unknown): unknown => {
    if (Array.isArray(valore)) return valore.map(cammina);
    if (valore === null || typeof valore !== 'object') return valore;

    const risultato: Record<string, unknown> = {};
    for (const [chiave, contenuto] of Object.entries(valore as Record<string, unknown>)) {
      if (CHIAVI_CON_NOMI.includes(chiave) && typeof contenuto === 'string') {
        if (sembraAttivita(contenuto)) {
          risultato[chiave] = contenuto;
        } else {
          risultato[chiave] = ANONIMO;
          anonimizzati += 1;
        }
      } else {
        risultato[chiave] = cammina(contenuto);
      }
    }
    return risultato;
  };

  return { metriche: cammina(metriche), anonimizzati };
}

/**
 * Le chiavi che possono contenere il nome di una persona.
 *
 * `categoria` no: le categorie sono nostre e nascono da una tassonomia, non da
 * una controparte bancaria.
 *
 * Il titolo degli avvisi **non arriva affatto** fin qui. «Netflix: il prezzo è
 * salito» è una frase che contiene un nome, e un filtro che decide se un *nome*
 * può uscire non saprebbe cosa farne: la lascerebbe passare intera o la
 * sostituirebbe intera. Le metriche mandano il nome in un campo suo — che
 * questo filtro tratta come ogni altro nome — e la frase la compone il modello.
 */
const CHIAVI_CON_NOMI = ['esercente'];
