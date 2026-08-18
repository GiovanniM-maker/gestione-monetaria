import { centesimiDi } from '@/lib/abbonamenti/formato';

/**
 * I gruppi temporali della schermata «Da confermare», e il loro ordinamento.
 *
 * Un modulo **puro**, come `ui/fette` e `dove/nodi`, e per la ragione di
 * sempre: qui dentro c'e' dell'aritmetica sui giorni, ed e' precisamente il
 * punto in cui questo progetto si e' gia' bruciato una volta — il movimento
 * delle 00:11 finito nel mese prima. Una funzione pura si prova con degli
 * assert; la stessa logica dentro un componente no.
 *
 * ---------------------------------------------------------------------------
 * «Ultime 24 ore» non esiste nei dati, e dirlo e' piu' onesto che fingerlo
 * ---------------------------------------------------------------------------
 * `booking_date` e' un **giorno civile**: una `date`, senza ora e senza fuso.
 * E' cosi' di proposito — una conversione UTC sposterebbe i movimenti di inizio
 * e fine mese nel mese sbagliato — e vuol dire che l'ora del pagamento noi non
 * ce l'abbiamo affatto.
 *
 * Quindi «ultime 24 ore» si puo' solo approssimare con «oggi», e «48 ore» con
 * «ieri». I gruppi si chiamano col nome di cio' che sono davvero: un'etichetta
 * «ultime 24 ore» su un insieme che in realta' e' «oggi» direbbe una cosa falsa
 * ogni mattina alle nove.
 *
 * ---------------------------------------------------------------------------
 * Il confronto si fa fra giorni, mai fra istanti
 * ---------------------------------------------------------------------------
 * Entrambe le date si riducono al loro giorno civile e si sottraggono come
 * numeri. `new Date(a) - new Date(b)` darebbe millisecondi, e il resto della
 * divisione per 86.400.000 dipenderebbe dall'ora locale: nei giorni di cambio
 * dell'ora legale un movimento salterebbe di gruppo.
 */

export const GRUPPI = ['oggi', 'ieri', 'settimana', 'prima'] as const;
export type ChiaveGruppo = (typeof GRUPPI)[number];

export const NOME_GRUPPO: Record<ChiaveGruppo, string> = {
  oggi: 'Oggi',
  ieri: 'Ieri',
  settimana: 'Ultimi 7 giorni',
  prima: 'Più di 7 giorni fa',
};

export const ORDINAMENTI = ['data', 'importo'] as const;
export type Ordinamento = (typeof ORDINAMENTI)[number];

/** Il giorno civile come numero, da `YYYY-MM-DD`. `null` se non e' una data. */
function giorno(valore: string): number | null {
  const t = /^(\d{4})-(\d{2})-(\d{2})/.exec(valore.trim());
  if (t === null) return null;
  return Date.UTC(Number(t[1]), Number(t[2]) - 1, Number(t[3])) / 86_400_000;
}

/**
 * In quale gruppo cade una data, rispetto a oggi.
 *
 * Una data **futura** finisce in `oggi` e non in un gruppo suo: succede col
 * `value_date` di certi addebiti, sono pochissimi, e un quinto gruppo per un
 * caso raro costa piu' attenzione di quanta ne renda. Quello che non deve
 * succedere e' che sparisca, e infatti non sparisce.
 */
export function gruppoDi(data: string, oggi: string): ChiaveGruppo {
  const a = giorno(data);
  const b = giorno(oggi);
  // Una data illeggibile va nel gruppo piu' vecchio invece di sparire: e'
  // sbagliata, ma i soldi che rappresenta sono veri.
  if (a === null || b === null) return 'prima';

  const scarto = b - a;
  if (scarto <= 0) return 'oggi';
  if (scarto === 1) return 'ieri';
  if (scarto < 7) return 'settimana';
  return 'prima';
}

export type Gruppo<T> = {
  chiave: ChiaveGruppo;
  nome: string;
  righe: readonly T[];
};

/**
 * Le righe divise in gruppi, ognuno ordinato.
 *
 * **I gruppi restano nell'ordine dichiarato**, sempre, anche ordinando per
 * importo: il tempo e' la struttura della schermata, l'importo e' l'ordine
 * dentro. Se cambiando ordinamento si rimescolassero anche i gruppi, la
 * schermata cambierebbe forma e non si ritroverebbe piu' niente.
 *
 * **Un gruppo vuoto non compare.** Un'intestazione «Ieri» sopra il nulla e' una
 * riga che occupa spazio per dire che non c'e' niente da dire.
 *
 * Per importo si ordina sul **modulo**: la domanda e' «qual e' il movimento
 * piu' grosso», e con le uscite negative un ordinamento sul segno metterebbe in
 * cima le entrate.
 */
export function raggruppaPerTempo<T extends { booking_date: string }>(
  righe: readonly T[],
  oggi: string,
  ordinamento: Ordinamento,
  importoDi: (r: T) => string | null,
): readonly Gruppo<T>[] {
  const per = new Map<ChiaveGruppo, T[]>();
  for (const r of righe) {
    const g = gruppoDi(r.booking_date, oggi);
    const dentro = per.get(g);
    if (dentro === undefined) per.set(g, [r]);
    else dentro.push(r);
  }

  const modulo = (v: bigint): bigint => (v < 0n ? -v : v);

  return GRUPPI.flatMap((chiave) => {
    const dentro = per.get(chiave);
    if (dentro === undefined || dentro.length === 0) return [];

    const ordinate = [...dentro].sort((a, b) => {
      if (ordinamento === 'importo') {
        const va = modulo(centesimiDi(importoDi(a)));
        const vb = modulo(centesimiDi(importoDi(b)));
        if (va !== vb) return va > vb ? -1 : 1;
      }
      // Anche ordinando per importo, a parita' si torna alla data: due spese
      // uguali in ordine casuale cambierebbero posto a ogni ridisegno.
      return a.booking_date < b.booking_date ? 1 : a.booking_date > b.booking_date ? -1 : 0;
    });

    return [{ chiave, nome: NOME_GRUPPO[chiave], righe: ordinate }];
  });
}
