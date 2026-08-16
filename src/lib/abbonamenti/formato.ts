/**
 * Le poche funzioni pure della Fase 5: somma di importi e formattazione.
 *
 * Sta in un modulo separato dal resto perche' e' l'unica parte verificabile
 * senza un database, ed e' anche quella che sbagliata non si vede: un totale
 * calcolato in float e' giusto in quasi tutti i casi, ed e' proprio per questo
 * che il caso in cui sbaglia arriva senza avvisare.
 *
 * Regola di CLAUDE.md: mai aritmetica su float. Qui dentro gli importi sono
 * interi di centesimi, e diventano stringhe solo all'ultima riga.
 */

import { parseCentesimiTollerante } from '@/lib/money';

/**
 * Le forme delle righe stanno qui e non accanto alle query.
 *
 * Non e' pignoleria: il modulo che interroga il database e' `server-only`, e
 * la schermata che disegna quelle righe gira nel browser. Tenerle li' obbliga
 * un componente client a importare un modulo server, e la compilazione si
 * ferma — giustamente, perche' un solo valore esportato per sbaglio da quel
 * modulo finirebbe nel bundle del browser.
 */

/**
 * Il criterio «entra nel numero» **non e' scritto qui**: e' la colonna
 * `nella_metrica` di `v_subscriptions`, calcolata in SQL.
 *
 * Duplicarlo in TypeScript significherebbe due definizioni che possono
 * divergere in silenzio, e la schermata mostrerebbe righe che il totale non
 * conta. Questa costante serve solo a spiegarlo a chi legge.
 */
export const CRITERIO_RICORRENZA =
  'attivo, presente in almeno 3 mesi civili e su almeno 75 giorni coperti';

export type RigaAbbonamento = {
  id: string;
  esercente: string;
  categoria: string | null;
  discrezionalita: string | null;
  contesto: string | null;
  /** `abbonamento` (si disdice) oppure `abitudine` (si cambia). */
  tipo: string;
  cadence: string;
  cadence_days: string | null;
  expected_amount: string | null;
  typical_amount: string | null;
  total_amount: string | null;
  covered_days: string | null;
  /** Deciso in SQL, non qui: e' il criterio della metrica, in un posto solo. */
  nella_metrica: boolean;
  costo_mensile: string | null;
  first_seen: string | null;
  last_seen: string | null;
  next_expected: string | null;
  occurrences: number;
  active_months: number;
  /** Regolarita' nel tempo, 0..1. Non filtra: descrive. */
  confidence: string | null;
  /** Stabilita' dell'importo, 0..1. Bassa su un servizio a consumo. */
  amount_stability: string | null;
  status: string;
  usage_verdict: string | null;
  notes: string | null;
};

export type RigaEsclusa = {
  motivo: string;
  esercenti: number;
  costo_mensile_potenziale: string | null;
  totale_speso: string | null;
};

export type Somma = {
  totale: bigint;
  /**
   * Quanti valori non si sono saputi leggere. Va riportato, non ingoiato: un
   * totale a cui mancano tre righe senza dirlo e' peggio di nessun totale.
   */
  nonLetti: number;
};

/** Somma importi che arrivano dal database come stringhe decimali. */
export function sommaCosti(valori: readonly unknown[]): Somma {
  let totale = 0n;
  let nonLetti = 0;

  for (const valore of valori) {
    const centesimi = parseCentesimiTollerante(valore);
    if (centesimi === null) nonLetti += 1;
    else totale += centesimi;
  }

  return { totale, nonLetti };
}

/**
 * Un solo importo, in centesimi, con lo zero come risposta a cio' che non si
 * legge.
 *
 * Era copiata in sei schermate — cruscotto, categoria, esercente, movimenti,
 * movimento, revisione — identica sei volte. Non e' un caso: e' il primo gesto
 * di ogni componente che riceve un importo da PostgREST, che arriva come
 * stringa apposta per non passare da un float.
 *
 * Lo zero e' una scelta: un importo illeggibile che diventasse `NaN`
 * spargerebbe `NaN` su tutta la somma, mentre a zero **si vede** che manca
 * qualcosa senza portarsi via il resto della schermata. Dove il conteggio di
 * cio' che non si legge conta davvero — i totali mensili — si usa `sommaCosti`
 * e si guarda `nonLetti`.
 */
export function centesimiDi(valore: unknown): bigint {
  return parseCentesimiTollerante(valore) ?? 0n;
}

/**
 * Da centesimi a `1.234,56 €`.
 *
 * Costruita a mano dalla rappresentazione intera e non con
 * `Intl.NumberFormat`: quello vuole un `number`, e passargli un importo grande
 * significa farlo transitare da un float proprio nell'ultimo passaggio, dopo
 * che tutta la catena l'ha evitato.
 */
export function formattaEuro(centesimi: bigint): string {
  const negativo = centesimi < 0n;
  const assoluto = negativo ? -centesimi : centesimi;

  const interi = (assoluto / 100n).toString();
  const decimali = (assoluto % 100n).toString().padStart(2, '0');

  const raggruppati = interi.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  return `${negativo ? '−' : ''}${raggruppati},${decimali} €`;
}

/**
 * Giorni civili fra due date `YYYY-MM-DD`.
 *
 * Nessuna conversione di fuso, come impone CLAUDE.md per `booking_date`: le
 * due date si leggono come giorni interi e si sottraggono. `new Date(stringa)`
 * su un formato solo-data e' gia' interpretato come UTC da entrambe le parti,
 * quindi la differenza e' esatta — ma la si calcola comunque dai componenti,
 * per non dipendere da quel dettaglio.
 */
export function giorniDaOggi(data: string, oggi: string): number | null {
  const a = giorno(data);
  const b = giorno(oggi);
  if (a === null || b === null) return null;
  return Math.round((a - b) / 86_400_000);
}

function giorno(valore: string): number | null {
  const trovato = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valore.trim());
  if (trovato === null) return null;
  return Date.UTC(Number(trovato[1]), Number(trovato[2]) - 1, Number(trovato[3]));
}

/**
 * La frase che l'applicazione esiste per produrre.
 *
 * «Voluttuario ricorrente: 187 €/mese». Riceve righe gia' aggregate da SQL: qui
 * non si calcola nessun numero nuovo, si sceglie solo quale mostrare per primo
 * — quello che pesa di piu'.
 */
export type RigaMetrica = {
  /** `abbonamento` si disdice, `abitudine` si cambia. Non si sommano. */
  tipo: string;
  discrezionalita: string;
  classe_nome: string;
  /**
   * Se la classe entra nel **totale**. Falso non vuol dire nascosta: la voce
   * resta nella ripartizione, sotto la linea, con il suo subtotale.
   */
  nel_ricorrente: boolean;
  contesto: string;
  ricorrenze: number;
  costo_mensile: string | null;
};

export type VoceMetrica = {
  tipo: string;
  discrezionalita: string;
  classeNome: string;
  nelRicorrente: boolean;
  contesto: string;
  ricorrenze: number;
  costoMensile: bigint;
};

export function ordinaPerPeso(righe: readonly RigaMetrica[]): readonly VoceMetrica[] {
  return (
    righe
      .map((r) => ({
        tipo: r.tipo,
        discrezionalita: r.discrezionalita,
        classeNome: r.classe_nome,
        nelRicorrente: r.nel_ricorrente,
        contesto: r.contesto,
        ricorrenze: r.ricorrenze,
        costoMensile: parseCentesimiTollerante(r.costo_mensile) ?? 0n,
      }))
      // Le uscite sono negative: la voce piu' pesante e' la piu' piccola.
      .sort((a, b) =>
        a.costoMensile < b.costoMensile ? -1 : a.costoMensile > b.costoMensile ? 1 : 0,
      )
  );
}

/**
 * Il totale di un tipo. Somma solo dentro `abbonamento` o dentro `abitudine`,
 * mai fra i due: sono due numeri distinti proprio perche' l'azione che
 * suggeriscono e' diversa, e un totale unico la nasconderebbe.
 *
 * E somma solo le classi **dentro il totale**: dalla `0043` una classe puo'
 * dichiararsi fuori — risparmio, tasse, una rata — e sommarla qui rimetterebbe
 * dentro «quanto potrei smettere di pagare» delle cose che non si smetteranno.
 * Quel che resta fuori non sparisce: lo restituisce `fuoriDalTotale`, e va
 * mostrato sotto la linea.
 */
export function totalePerTipo(voci: readonly VoceMetrica[], tipo: string): bigint {
  return voci.reduce(
    (somma, v) => (v.tipo === tipo && v.nelRicorrente ? somma + v.costoMensile : somma),
    0n,
  );
}

/**
 * Il ricorrente che sta fuori dal totale: quanto vale, e di quali classi e'
 * fatto.
 *
 * Una riga sola e non due, perche' qui la distinzione fra abbonamento e
 * abitudine non serve a niente: sono cose che non si toccano, e proporre di
 * disdirle o di cambiarle sarebbe proporre esattamente cio' che l'utente ha
 * dichiarato di non voler fare.
 */
export function fuoriDalTotale(voci: readonly VoceMetrica[]): {
  costoMensile: bigint;
  ricorrenze: number;
  classi: readonly string[];
} {
  const fuori = voci.filter((v) => !v.nelRicorrente);
  return {
    costoMensile: fuori.reduce((s, v) => s + v.costoMensile, 0n),
    ricorrenze: fuori.reduce((s, v) => s + v.ricorrenze, 0),
    classi: [...new Set(fuori.map((v) => v.classeNome))],
  };
}
