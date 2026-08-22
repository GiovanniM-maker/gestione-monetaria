import type { PostgrestError } from '@supabase/supabase-js';

/**
 * Quale messaggio del database puo' finire davanti all'utente.
 *
 * ---------------------------------------------------------------------------
 * Il difetto, misurato
 * ---------------------------------------------------------------------------
 * Le funzioni di scrittura facevano `throw new XNonValida(error.message)`, e da
 * li' il messaggio diventa un **400** con il testo dentro, che l'interfaccia
 * mostra come prosa. Provocando un errore vero durante l'audit di qualita', a
 * schermo e' comparso:
 *
 *     duplicate key value violates unique constraint
 *     "merchant_aliases_pattern_match_type_key"
 *
 * In inglese, con dentro il nome di un vincolo. E' esattamente il gettone
 * tecnico che `lib/ui/errori.ts` esiste per non far arrivare a nessuna
 * schermata — solo che entrava da una porta che quel modulo non sorveglia,
 * perche' per un 4xx con un messaggio si fida del messaggio.
 *
 * ---------------------------------------------------------------------------
 * Perche' non basta bloccarli tutti
 * ---------------------------------------------------------------------------
 * Alcuni messaggi del database sono **scritti per l'utente**, di proposito:
 * `valida_classe` risponde «Discrezionalita' non ammessa: X. Valori validi: …»
 * ed elenca le classi di **adesso**, che e' la ragione per cui quella
 * validazione vive in SQL invece che in TypeScript (0046). Zittirla
 * sostituirebbe un difetto con un altro.
 *
 * ---------------------------------------------------------------------------
 * Come si distinguono, senza indovinare
 * ---------------------------------------------------------------------------
 * Non serve una regola sulla forma del testo: la differenza sta nei **dati**.
 * Un `raise exception` scritto da noi, senza `using errcode`, produce lo
 * SQLSTATE **`P0001`** (`raise_exception`). Tutto il resto — `23505` chiave
 * duplicata, `23503` chiave esterna, `23514` vincolo di controllo, `22P02`
 * sintassi di un valore, `42501` permesso negato, e i `PGRST…` di PostgREST —
 * viene dal motore, non da una frase che qualcuno ha scritto per essere letta.
 *
 * Il verso in cui questa regola sbaglia e' quello giusto: un messaggio nostro a
 * cui qualcuno desse un `errcode` diverso diventerebbe generico — leggibile ma
 * meno utile — mentre un errore interno nuovo resta **fuori** senza che nessuno
 * debba ricordarsene. Fallisce chiusa, come la regola 8.
 */

/** Lo SQLSTATE di `raise exception` senza `using errcode`: i messaggi nostri. */
const NOSTRO = 'P0001';

export function messaggioUtente(errore: PostgrestError, ripiego: string): string {
  return errore.code === NOSTRO ? errore.message : ripiego;
}
