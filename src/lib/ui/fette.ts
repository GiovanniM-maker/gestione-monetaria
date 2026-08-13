/**
 * Le proporzioni di una barra segmentata e di una ciambella.
 *
 * Un modulo puro, come `copilota/grafico.ts` e per la stessa ragione: le due
 * decisioni che possono mentire con dati veri sono nella geometria, non nei
 * dati, e una geometria in un componente non si prova con degli assert.
 *
 * ---------------------------------------------------------------------------
 * Gli importi non passano da un float
 * ---------------------------------------------------------------------------
 * I valori restano `bigint` fino all'ultima riga; escono **millesimi di giro**,
 * cioe' interi. I pixel sono float, e va bene: un pixel e' una posizione, non un
 * euro.
 *
 * ---------------------------------------------------------------------------
 * I confini si calcolano cumulati, non uno per uno
 * ---------------------------------------------------------------------------
 * Arrotondando ogni fetta per conto suo, gli errori si sommano: dieci fette da
 * un decimo lasciano un buco alla fine, e su una ciambella il buco si vede.
 * Calcolando invece dove **finisce** ciascuna fetta sul totale cumulato, ogni
 * confine e' esatto e l'ultimo cade su 1000 per costruzione.
 */

/** Millesimi del giro: 1000 = tutto. Interi, quindi niente deriva. */
export const GIRO = 1000;

export type Voce = {
  chiave: string;
  /** In centesimi. Il segno non conta: una fetta lunga meno di zero non esiste. */
  valore: bigint;
};

export type Fetta = {
  chiave: string;
  valore: bigint;
  /** Da dove comincia, in millesimi di giro. */
  inizio: number;
  /** Quanto e' lunga, in millesimi di giro. */
  lunghezza: number;
};

function modulo(v: bigint): bigint {
  return v < 0n ? -v : v;
}

/**
 * Le fette, nell'ordine ricevuto.
 *
 * L'ordine e' di chi chiama e non si tocca: su una barra per classe di
 * discrezionalita' l'ordine e' sempre lo stesso apposta — e' cio' che rende la
 * forma della barra riconoscibile a colpo d'occhio, e un mese anomalo visibile
 * senza leggere un numero.
 */
export function fette(voci: readonly Voce[]): readonly Fetta[] {
  const totale = voci.reduce((s, v) => s + modulo(v.valore), 0n);
  if (totale === 0n) {
    return voci.map((v) => ({ chiave: v.chiave, valore: v.valore, inizio: 0, lunghezza: 0 }));
  }

  const risultato: Fetta[] = [];
  let cumulato = 0n;
  let confinePrecedente = 0;

  for (const v of voci) {
    cumulato += modulo(v.valore);
    const confine = Number((cumulato * BigInt(GIRO)) / totale);
    risultato.push({
      chiave: v.chiave,
      valore: v.valore,
      inizio: confinePrecedente,
      lunghezza: confine - confinePrecedente,
    });
    confinePrecedente = confine;
  }

  return risultato;
}

export type Arco = {
  chiave: string;
  /** Lunghezza del tratto disegnato, nelle unita' del disegno. */
  tratto: number;
  /** Quanto resta di circonferenza dopo il tratto: e' il secondo valore di `stroke-dasharray`. */
  vuoto: number;
  /** `stroke-dashoffset`, gia' col segno giusto. */
  scostamento: number;
};

/**
 * Le fette come archi di un cerchio, per `stroke-dasharray`.
 *
 * Si disegna un cerchio intero per fetta, tratteggiato in modo che se ne veda
 * solo l'arco che le spetta. E' molto piu' difficile da sbagliare che comporre
 * a mano dei percorsi `A` con seni e coseni — e un settore anulare sbagliato di
 * mezzo grado non produce un errore, produce una figura che mente.
 *
 * `stroke-dashoffset` arretra il tratteggio, quindi per far cominciare la fetta
 * a `inizio` serve il valore **negativo**.
 */
export function archi(pezzi: readonly Fetta[], raggio: number): readonly Arco[] {
  const circonferenza = 2 * Math.PI * raggio;
  return pezzi.map((f) => {
    const tratto = (circonferenza * f.lunghezza) / GIRO;
    return {
      chiave: f.chiave,
      tratto,
      vuoto: Math.max(0, circonferenza - tratto),
      scostamento: -((circonferenza * f.inizio) / GIRO),
    };
  });
}

/**
 * Le prime N voci, piu' quanto vale tutto il resto.
 *
 * Serve alla ciambella: oltre sette colori due fette adiacenti si somigliano, e
 * la figura smette di dire in quale scendere. Ma il resto **non si butta** —
 * sparirebbe dal giro, e un anello che non chiude e' una figura che dice che
 * manca qualcosa quando non manca niente.
 *
 * Il taglio scatta solo se toglie almeno due voci: sostituire l'ultima con
 * «altre 1 categorie» non semplifica niente e perde un nome.
 */
export function conResto<T extends Voce>(
  voci: readonly T[],
  quante: number,
): { teste: readonly T[]; resto: { voci: number; valore: bigint } | null } {
  if (quante < 1 || voci.length <= quante + 1) return { teste: voci, resto: null };

  const coda = voci.slice(quante);
  return {
    teste: voci.slice(0, quante),
    resto: { voci: coda.length, valore: coda.reduce((s, v) => s + v.valore, 0n) },
  };
}

/**
 * Millesimi in percentuale, per una larghezza CSS.
 *
 * Si divide per dieci e basta: `(333 / 1000) * 100` in virgola mobile da'
 * `33.300000000000004`, e finirebbe scritto cosi' nell'attributo `style`. Non
 * cambia un pixel, ma un numero del genere nel sorgente della pagina fa
 * sospettare che da qualche parte si stia contando col float — ed e' proprio
 * la cosa di cui questa applicazione ha bisogno che non si sospetti.
 */
export function larghezza(f: Fetta): string {
  return `${f.lunghezza / (GIRO / 100)}%`;
}
