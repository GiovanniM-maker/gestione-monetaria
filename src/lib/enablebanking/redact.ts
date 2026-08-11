import { maskIban } from './client';

/**
 * Oscura gli IBAN dentro una struttura JSON arbitraria, prima di mostrarla.
 *
 * La Fase 1 prevede una pagina che mostri le risposte grezze, ma la regola 7
 * di CLAUDE.md dice che gli IBAN si mostrano solo mascherati. Le due cose
 * convivono solo passando da qui.
 *
 * Il mascheramento avviene su due criteri, perche' uno solo non basta: per nome
 * di campo (`iban`, `IBAN`, `debtor_iban`...) e per forma del valore, cosi'
 * copre anche gli IBAN che compaiono dentro una descrizione libera.
 */

/** Due lettere, due cifre di controllo, poi da 10 a 30 alfanumerici. */
const IBAN_PATTERN = /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g;

function mascheraNelTesto(testo: string): string {
  return testo.replace(IBAN_PATTERN, (trovato) => maskIban(trovato));
}

export function redigi(valore: unknown): unknown {
  if (typeof valore === 'string') return mascheraNelTesto(valore);
  if (Array.isArray(valore)) return valore.map(redigi);

  if (valore !== null && typeof valore === 'object') {
    return Object.fromEntries(
      Object.entries(valore as Record<string, unknown>).map(([chiave, contenuto]) =>
        /iban/i.test(chiave) && typeof contenuto === 'string'
          ? [chiave, maskIban(contenuto)]
          : [chiave, redigi(contenuto)],
      ),
    );
  }

  return valore;
}

/** JSON leggibile e già oscurato, pronto da mettere in un `<pre>`. */
export function jsonRedatto(valore: unknown): string {
  return JSON.stringify(redigi(valore), null, 2);
}

/**
 * Restituisce sempre un array, qualunque cosa sia arrivata.
 *
 * In una pagina di debug il costo di un campo assente non deve essere una
 * pagina bianca con "A server error occurred": deve essere una riga che dice
 * che quel campo non c'era, mentre tutto il resto continua a mostrarsi.
 */
export function comeArray<T>(valore: unknown): readonly T[] {
  return Array.isArray(valore) ? (valore as T[]) : [];
}
