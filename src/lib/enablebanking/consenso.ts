/**
 * Quanto consenso chiedere alla banca.
 *
 * Si chiede **il massimo che il connettore dichiara**, non un valore fisso.
 * Ogni scadenza costa un rinnovo manuale via SCA, e i connettori non concedono
 * tutti la stessa cosa: Revolut (LT) dichiara 180 giorni, contro i 90 che si
 * tenderebbe a dare per scontati. Chiederne 90 raddoppierebbe i rinnovi senza
 * guadagnare niente.
 *
 * Il valore arriva dalla risposta di `/aspsps`, quindi dalla rete, quindi non
 * ci si fida: assente, non numerico, assurdamente piccolo o piu' grande del
 * tetto sono tutti casi che ripiegano sul predefinito invece di propagarsi in
 * una richiesta malformata.
 */

/** Ripiego quando il connettore non dichiara niente di utilizzabile. */
export const CONSENSO_PREDEFINITO_SECONDI = 90 * 24 * 60 * 60;

/** Tetto di sicurezza: nessun connettore concede di piu', e oltre e' un errore. */
export const CONSENSO_MASSIMO_SECONDI = 365 * 24 * 60 * 60;

/** Sotto un giorno il consenso non servirebbe a niente: e' un valore rotto. */
const CONSENSO_MINIMO_SECONDI = 24 * 60 * 60;

/**
 * Margine sottratto alla scadenza richiesta.
 *
 * Chiedere esattamente il massimo dichiarato significa arrivare al confronto
 * lato banca qualche istante dopo averlo calcolato, e farsi rifiutare per un
 * arrotondamento — nel momento peggiore, cioe' quando si sta autorizzando.
 */
export const MARGINE_SECONDI = 60;

export function secondiDiConsenso(dichiarato: unknown): number {
  const secondi =
    typeof dichiarato === 'number'
      ? dichiarato
      : typeof dichiarato === 'string'
        ? Number.parseInt(dichiarato, 10)
        : Number.NaN;

  if (!Number.isFinite(secondi) || secondi < CONSENSO_MINIMO_SECONDI) {
    return CONSENSO_PREDEFINITO_SECONDI;
  }
  return Math.min(Math.trunc(secondi), CONSENSO_MASSIMO_SECONDI);
}

/** La scadenza da mandare alla banca, margine gia' applicato. */
export function scadenzaConsenso(dichiarato: unknown, adesso: Date = new Date()): Date {
  return new Date(adesso.getTime() + (secondiDiConsenso(dichiarato) - MARGINE_SECONDI) * 1000);
}
