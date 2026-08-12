/**
 * Abbinamento di una transazione al suo esercente canonico.
 *
 * Funzione pura, come il normalizzatore dei movimenti: nessun accesso a rete o
 * database, così ogni regola è verificabile con un test invece che con un giro
 * completo di categorizzazione.
 *
 * ---------------------------------------------------------------------------
 * Perché la normalizzazione qui è volutamente timida
 * ---------------------------------------------------------------------------
 * La tentazione era scrivere un normalizzatore aggressivo — via i suffissi
 * societari, via le città, ordinamento dei token — e sperare che i nomi
 * collassassero da soli. Provato sui 60 esercenti veri: **da 60 forme a 58**.
 * Due accorpamenti, e nessuno dei casi che contano davvero.
 *
 * Non li prendeva perché non sono problemi di ortografia:
 *
 *   `Claude.ai Subscription`  e  `Anthropic* Claude Sub`   marchio contro società
 *   `Dott Scooter Ride`       e  `www.ridedott.com*Dott…`  dominio e città in coda
 *   `Hotel At Booking.com`    e  `Bkg*booking.com Flight`  prodotti diversi
 *   `Paddle.net* N8n Cloud1`                               l'esercente è n8n, Paddle incassa
 *
 * Nessuna regola meccanica sa che Anthropic e Claude sono la stessa cosa, o che
 * Paddle è solo il casello. È un'informazione sul mondo, non sulla stringa.
 *
 * E il normalizzatore aggressivo non era neutro: togliendo i suffissi societari
 * avrebbe unito `Comet Spa` e `Bruno Spa-modica`, che condividono "spa" e non
 * c'entrano niente. **Fondere due esercenti distinti è più dannoso che tenerne
 * uno diviso in due**: il secondo si vede e si corregge, il primo produce un
 * totale plausibile e sbagliato.
 *
 * Quindi qui si fa solo ciò che è sicuro — minuscole, punteggiatura uniformata,
 * spazi compattati — e il lavoro vero lo fanno gli alias `contains`, che sono
 * dichiarazioni esplicite e ispezionabili. Sui casi qui sopra bastano quattro
 * alias: `claude`, `dott scooter`, `booking`, `n8n`.
 */

export type TipoConfronto = 'exact' | 'contains' | 'regex';

export type Alias = {
  merchantId: string;
  pattern: string;
  matchType: TipoConfronto;
  priority: number;
};

/**
 * Forma canonica usata per il confronto.
 *
 * Si applica **sia all'etichetta sia al pattern**: è ciò che rende il confronto
 * simmetrico e prevedibile. Un alias scritto `Apple.com/bill` e un'etichetta
 * `APPLE.COM/BILL` devono incontrarsi senza che chi scrive l'alias debba sapere
 * come è fatta la normalizzazione.
 */
export function normalizzaEtichetta(valore: string): string {
  return valore
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * L'alias vincente per un'etichetta, oppure `null`.
 *
 * L'ordine di precedenza, in questo ordine:
 *
 * 1. **`priority` più alta.** È il controllo manuale, per i casi che le altre
 *    due regole sbaglierebbero.
 * 2. **Pattern più lungo.** Un pattern lungo è più specifico di uno corto, e
 *    senza questa regola `contains 'amazon'` mangerebbe `contains 'amazon
 *    prime'` — un abbonamento sparirebbe dentro gli acquisti a seconda
 *    dell'ordine con cui il database restituisce le righe.
 * 3. **`exact` prima di `contains` prima di `regex`**, a parità di tutto il
 *    resto: dal più letterale al più interpretativo.
 *
 * Nessuno dei tre criteri dipende dall'ordine di arrivo degli alias: due
 * esecuzioni sugli stessi dati devono dare lo stesso esercente, sempre.
 */
export function abbinaMerchant(etichetta: string, alias: readonly Alias[]): Alias | null {
  const bersaglio = normalizzaEtichetta(etichetta);
  if (bersaglio === '') return null;

  const specificita: Record<TipoConfronto, number> = { exact: 2, contains: 1, regex: 0 };

  let migliore: Alias | null = null;

  for (const a of alias) {
    if (!corrisponde(bersaglio, a)) continue;
    if (migliore === null || vince(a, migliore, specificita)) migliore = a;
  }

  return migliore;
}

function vince(
  candidato: Alias,
  attuale: Alias,
  specificita: Record<TipoConfronto, number>,
): boolean {
  if (candidato.priority !== attuale.priority) return candidato.priority > attuale.priority;

  const lunghezzaCandidato = normalizzaEtichetta(candidato.pattern).length;
  const lunghezzaAttuale = normalizzaEtichetta(attuale.pattern).length;
  if (lunghezzaCandidato !== lunghezzaAttuale) return lunghezzaCandidato > lunghezzaAttuale;

  return specificita[candidato.matchType] > specificita[attuale.matchType];
}

function corrisponde(bersaglio: string, alias: Alias): boolean {
  if (alias.matchType === 'regex') {
    // Un pattern malformato non deve portare giù l'intera categorizzazione:
    // vale come "non corrisponde", e la transazione resta da classificare —
    // che è visibile, mentre un'eccezione qui fermerebbe tutto il resto.
    try {
      return new RegExp(alias.pattern, 'i').test(bersaglio);
    } catch {
      return false;
    }
  }

  const pattern = normalizzaEtichetta(alias.pattern);
  if (pattern === '') return false;

  return alias.matchType === 'exact' ? bersaglio === pattern : bersaglio.includes(pattern);
}

/**
 * L'etichetta da cui parte l'abbinamento.
 *
 * `counterparty_raw` per primo perché è il nome dell'esercente; la causale è la
 * seconda scelta, e serve dove il creditore manca — i bonifici, i prelievi.
 */
export function etichettaDiRiferimento(movimento: {
  counterparty_raw: string | null;
  raw_description: string | null;
}): string | null {
  const preferita = movimento.counterparty_raw?.trim();
  if (preferita !== undefined && preferita !== '') return preferita;

  const ripiego = movimento.raw_description?.trim();
  return ripiego !== undefined && ripiego !== '' ? ripiego : null;
}
