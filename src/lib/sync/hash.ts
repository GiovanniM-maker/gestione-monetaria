import { createHash } from 'node:crypto';

/**
 * Serializzazione JSON deterministica: stesse chiavi, stesso ordine, stessa
 * stringa. `JSON.stringify` non lo garantisce, perche' conserva l'ordine di
 * inserimento delle proprieta'.
 *
 * Serve perche' `payload_hash` e' meta' della chiave di deduplicazione di
 * `raw_transactions`. Se lo stesso movimento producesse due hash diversi solo
 * perche' l'API ha restituito i campi in un altro ordine, il vincolo di unicita'
 * non scatterebbe e ogni sync riscriverebbe tutto.
 */
export function canonicalJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';

  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, contenuto]) => contenuto !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

/**
 * Impronta del payload di una singola transazione.
 *
 * Nota deliberata: una transazione vista prima come `PDNG` e poi come `BOOK` ha
 * payload diversi, quindi hash diversi, quindi due righe in `raw_transactions`.
 * E' corretto: quella tabella e' il registro immutabile di cio' che l'API ha
 * risposto, non l'elenco dei movimenti. La riconciliazione fra le due versioni
 * avviene in Fase 3, sulla chiave `entry_reference`.
 */
export function payloadHash(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}
