/**
 * Le variazioni, come si leggono e come si disegnano.
 *
 * Qui non si calcola **niente**: la percentuale e il giudizio (`su`, `giu`,
 * `stabile`, `nuovo`) arrivano gia' fatti dalle funzioni della `0036`, perche'
 * una variazione percentuale e' una divisione e le regole di correttezza
 * vogliono l'aritmetica in SQL. Questo modulo sceglie un simbolo e un colore, e
 * arrotonda un numero che e' gia' una percentuale — non un importo.
 *
 * Sta separato dal modulo che interroga il database per la stessa ragione di
 * `abbonamenti/formato.ts`: quello e' `server-only`, e i tipi delle righe
 * servono anche a un componente che potrebbe finire nel browser.
 */

export type Andamento = 'su' | 'giu' | 'stabile' | 'nuovo';

const ANDAMENTI: readonly string[] = ['su', 'giu', 'stabile', 'nuovo'];

/** I campi che le tre funzioni hanno in comune. Gli importi sono `text`. */
export type Variazione = {
  spesa: string;
  /** Il **mese tipico**: la mediana scelta dei mesi precedenti. Mai «la media». */
  tipico: string | null;
  /** Percentuale con un decimale, gia' calcolata in SQL. `null` = niente da confrontare. */
  variazione_pct: string | null;
  andamento: string;
  movimenti: number;
  mesi_di_confronto: number;
  /** Su quanti giorni del mese e' fatto il confronto. `null` = mesi interi. */
  giorni_confrontati: number | null;
};

export type VariazioneClasse = Variazione & {
  discrezionalita: string;
  contesto: string;
};

export type VariazioneCategoria = Variazione & {
  category_id: string;
  categoria: string;
  parent_id: string | null;
};

export type VariazioneEsercente = Variazione & {
  merchant_id: string;
  esercente: string;
};

/**
 * Come si mostra una variazione.
 *
 * `null` quando non c'e' niente da mostrare: un valore di `andamento` che non
 * riconosciamo non diventa una freccia a caso. Meglio nessun segno che un segno
 * sbagliato — su un cruscotto una freccia si crede.
 */
export type Segno = {
  simbolo: string;
  testo: string;
  /** `su` = si spende di piu', `giu` = di meno, `neutro` = non e' successo niente. */
  tono: 'su' | 'giu' | 'neutro';
  /** La frase per il lettore di schermo e per il `title`. */
  descrizione: string;
};

/**
 * Il segno da mettere accanto a una riga.
 *
 * Il tono segue la **spesa**, non il gradimento: spendere di piu' e' `su` anche
 * quando e' un investimento. Dire a qualcuno se ha fatto bene non e' compito di
 * un cruscotto — questa applicazione misura, non prescrive.
 */
export function segnoDi(riga: Variazione): Segno | null {
  if (!ANDAMENTI.includes(riga.andamento)) return null;
  const andamento = riga.andamento as Andamento;

  if (andamento === 'nuovo') {
    return {
      simbolo: '·',
      testo: 'nuovo',
      tono: 'neutro',
      descrizione: 'non c’era nei mesi precedenti, quindi non c’è un confronto',
    };
  }

  const pct = percentualeIntera(riga.variazione_pct);
  const testo = pct === null ? '' : `${pct > 0 ? '+' : ''}${pct}%`;

  if (andamento === 'stabile') {
    return {
      simbolo: '▬',
      testo: testo === '' ? 'stabile' : testo,
      tono: 'neutro',
      descrizione: 'come il solito, sotto il 5% di scarto',
    };
  }

  return {
    simbolo: andamento === 'su' ? '▲' : '▼',
    testo,
    tono: andamento,
    descrizione:
      testo === ''
        ? `hai speso ${andamento === 'su' ? 'più' : 'meno'} del mese tipico`
        : `${testo} rispetto al mese tipico`,
  };
}

/**
 * Da `"-10.3"` a `-10`.
 *
 * L'arrotondamento su un `number` e' ammesso qui e solo qui: quello che arriva
 * **e' gia' una percentuale**, calcolata in SQL. Non e' denaro, e un punto
 * percentuale in meno sul cruscotto non e' un centesimo perso — e' una cifra in
 * meno da leggere col pollice.
 */
export function percentualeIntera(valore: string | null): number | null {
  if (valore === null) return null;
  const n = Number(valore);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/**
 * Come si dice la finestra del confronto, in fondo alla schermata.
 *
 * Non e' un dettaglio da nascondere: un `+31%` calcolato sui primi tredici
 * giorni e uno calcolato su mesi interi rispondono a due domande diverse, e chi
 * legge deve poter sapere quale delle due sta guardando.
 */
export function comeSiConfronta(riga: Variazione | undefined): string | null {
  if (riga === undefined) return null;
  const mesi = riga.mesi_di_confronto;
  if (mesi <= 0) return null;

  const quanti = `${mesi} ${mesi === 1 ? 'mese' : 'mesi'}`;
  return riga.giorni_confrontati === null
    ? `Confronto con il mese tipico dei ${quanti} precedenti, interi.`
    : `Confronto sui primi ${riga.giorni_confrontati} giorni, contro gli stessi giorni del mese tipico dei ${quanti} precedenti.`;
}
