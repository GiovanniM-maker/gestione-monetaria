import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { comeArray } from '@/lib/enablebanking/redact';
import { formattaCentesimi, parseCentesimiTollerante } from '@/lib/money';
import { abbinaMerchant, etichettaDiRiferimento, type Alias } from './abbinamento';
import type {
  CategoryRow,
  Context,
  Discretion,
  MerchantAliasRow,
  MerchantRow,
} from '@/lib/db/types';

/**
 * Applica la tassonomia alle transazioni: da testo grezzo a esercente,
 * categoria, discrezionalita' e contesto.
 *
 * Due proprieta' lo rendono rieseguibile senza pensarci:
 *
 * 1. **Ricalcola invece di accumulare.** Una riga che non corrisponde piu' a
 *    nessun alias viene *svuotata*, non lasciata com'era. Senza questo, togliere
 *    un alias sbagliato non basterebbe a disfarne l'effetto: le transazioni gia'
 *    marcate resterebbero attaccate all'esercente sbagliato per sempre, e la
 *    correzione sembrerebbe non aver funzionato.
 * 2. **Le correzioni manuali sono intoccabili.** `manually_categorized` esclude
 *    la riga in partenza, con un filtro sulla query e non con un controllo nel
 *    ciclo: cosi' non c'e' un percorso di codice che possa dimenticarsene.
 */

export type EsitoCategorizzazione = {
  esaminate: number;
  abbinate: number;
  nonAbbinate: number;
  protette: number;
  /**
   * Gli stessi due conteggi ristretti alle **spese reali**.
   *
   * Sono questi i numeri che dicono qualcosa. Sul totale delle transazioni la
   * copertura risultava del 35%, e la lista di lavoro si apriva con
   * `To Conto deposito senza vincoli` — 47 movimenti, 49.844 euro — che e' un
   * giroconto gia' riconosciuto, non una spesa da classificare. Misurare li'
   * significa misurare quanto bene categorizziamo cose che non vanno
   * categorizzate.
   */
  speseEsaminate: number;
  speseAbbinate: number;
  /**
   * La copertura in euro, che e' quella che decide.
   *
   * Contare i movimenti sopravvaluta la coda: cinquecento caffe' da due euro
   * sono cinquecento righe e mille euro, un affitto e' una riga e settecento.
   * La metrica dell'app e' un importo, quindi la domanda giusta e' «quanta
   * spesa e' classificata», non «quante righe».
   */
  speseTotale: string;
  speseTotaleAbbinato: string;
  /**
   * Quante righe sono state **davvero** toccate, non quante ne sono state
   * riscritte.
   *
   * Prima non era osservabile: il ciclo di `UPDATE` riscriveva ogni riga a ogni
   * giro, quindi «ha lavorato» e «non e' cambiato niente» erano indistinguibili.
   * Sono il segnale su cui poggia l'invalidazione della cache — un giro che non
   * ha assegnato ne' svuotato niente non ha motivo di buttarla.
   */
  assegnate: number;
  svuotate: number;
  /** Le etichette non abbinate, per spesa decrescente: e' la lista di lavoro. */
  daGuardare: readonly { etichetta: string; movimenti: number; totale: string }[];
  /** Importi che non si sono lasciati leggere: se non e' zero, l'ordinamento sopra e' parziale. */
  importiNonLetti: number;
};

type RigaDaClassificare = {
  id: string;
  /** `unknown` di proposito: e' cio' che arriva dalla rete, non cio' che vorremmo. */
  amount: unknown;
  counterparty_raw: string | null;
  raw_description: string | null;
  is_transfer: boolean;
  is_refund: boolean;
  excluded_from_analysis: boolean;
  /** Il conto, innestato. Forma non garantita: vedi `inclusoNeiTotali`. */
  accounts: unknown;
};

/**
 * `include_in_totals` del conto, senza dare per scontata la forma della
 * risposta: su una relazione molti-a-uno il client puo' restituire l'oggetto o
 * un array di uno, e questo codice non deve dipendere da quale dei due.
 *
 * In dubbio risponde `false`, cioe' "non e' una spesa": sovrastimare la
 * copertura sarebbe peggio che sottostimarla.
 */
function inclusoNeiTotali(innestato: unknown): boolean {
  const conto = Array.isArray(innestato) ? innestato[0] : innestato;
  return (conto as { include_in_totals?: unknown } | null)?.include_in_totals === true;
}

/** Le stesse quattro esclusioni di `v_expenses`, applicate riga per riga. */
function eSpesaReale(riga: RigaDaClassificare, centesimi: bigint | null): boolean {
  return (
    centesimi !== null &&
    centesimi < 0n &&
    !riga.is_transfer &&
    !riga.is_refund &&
    !riga.excluded_from_analysis &&
    inclusoNeiTotali(riga.accounts)
  );
}

/**
 * Cosa si scrive sulla transazione. Tutti i campi ammettono `null` perche' una
 * riga puo' avere un esercente senza categoria, o una categoria senza contesto.
 *
 * Lo svuotamento delle righe che non corrispondono piu' a nessun alias non
 * passa di qui: e' `p_da_svuotare` di `applica_assegnazioni`. Resta pero' la
 * stessa cosa concettualmente, ed e' cio' che rende il ricalcolo davvero un
 * ricalcolo — togliere un alias sbagliato deve bastare a disfarne l'effetto.
 */
type Assegnazione = {
  merchant_id: string | null;
  category_id: string | null;
  discretion: Discretion | null;
  context: Context | null;
};

const DIMENSIONE_BLOCCO = 1000;

export async function applicaTassonomia(): Promise<EsitoCategorizzazione> {
  const supabase = await createSupabaseServerClient();

  const [{ data: merchantsGrezzi }, { data: aliasGrezzi }, { data: categorieGrezze }] =
    await Promise.all([
      supabase.from('merchants').select('*'),
      supabase.from('merchant_aliases').select('*'),
      supabase.from('categories').select('*'),
    ]);

  const categorie = new Map(comeArray<CategoryRow>(categorieGrezze).map((c) => [c.id, c] as const));

  // La discrezionalita' della categoria fa da ripiego a quella dell'esercente:
  // e' il valore di partenza per un merchant appena creato, che altrimenti
  // resterebbe fuori dalla metrica principale finche' qualcuno non se ne
  // accorge.
  const assegnazioni = new Map<string, Assegnazione>(
    comeArray<MerchantRow>(merchantsGrezzi).map((m) => {
      const categoria = m.category_id === null ? undefined : categorie.get(m.category_id);
      return [
        m.id,
        {
          merchant_id: m.id,
          category_id: m.category_id,
          discretion: m.discretion ?? categoria?.default_discretion ?? null,
          context: m.context,
        },
      ] as const;
    }),
  );

  const alias: Alias[] = comeArray<MerchantAliasRow>(aliasGrezzi).map((a) => ({
    merchantId: a.merchant_id,
    pattern: a.pattern,
    matchType: a.match_type,
    priority: a.priority,
  }));

  const { count: protette } = await supabase
    .from('transactions')
    .select('*', { count: 'exact', head: true })
    .eq('manually_categorized', true);

  let esaminate = 0;
  let abbinate = 0;
  let speseEsaminate = 0;
  let speseAbbinate = 0;
  let speseCentesimi = 0n;
  let speseCentesimiAbbinati = 0n;
  let importiNonLetti = 0;
  const perAssegnazione = new Map<string, string[]>();
  const daSvuotare: string[] = [];
  const scoperte = new Map<string, { movimenti: number; centesimi: bigint }>();

  for (let da = 0; ; da += DIMENSIONE_BLOCCO) {
    const { data, error } = await supabase
      .from('transactions')
      // `amount::text` non e' un vezzo: PostgREST serializza `numeric` come
      // numero JSON, quindi senza il cast l'importo arriverebbe qui come float
      // — proprio il tipo che CLAUDE.md vieta per il denaro. Chiedendo il testo
      // si parla a `parseCentesimi` nella lingua che si aspetta.
      .select(
        'id, amount::text, counterparty_raw, raw_description, is_transfer, is_refund, ' +
          'excluded_from_analysis, accounts!inner(include_in_totals)',
      )
      .eq('manually_categorized', false)
      .order('id', { ascending: true })
      .range(da, da + DIMENSIONE_BLOCCO - 1);

    if (error !== null) throw new Error(`Lettura transactions fallita: ${error.message}`);

    const blocco = comeArray<RigaDaClassificare>(data);
    if (blocco.length === 0) break;

    for (const riga of blocco) {
      esaminate += 1;
      const centesimi = parseCentesimiTollerante(riga.amount);
      if (centesimi === null) importiNonLetti += 1;

      const spesa = eSpesaReale(riga, centesimi);
      if (spesa) {
        speseEsaminate += 1;
        speseCentesimi += centesimi ?? 0n;
      }

      const etichetta = etichettaDiRiferimento(riga);
      const trovato = etichetta === null ? null : abbinaMerchant(etichetta, alias);

      if (trovato === null) {
        daSvuotare.push(riga.id);
        // La lista di lavoro contiene solo spese reali. Un giroconto senza
        // esercente non e' un buco da riempire: e' un movimento che non deve
        // avere un esercente.
        if (etichetta !== null && spesa) {
          const corrente = scoperte.get(etichetta) ?? { movimenti: 0, centesimi: 0n };
          corrente.movimenti += 1;
          if (centesimi !== null) corrente.centesimi += centesimi;
          scoperte.set(etichetta, corrente);
        }
        continue;
      }

      abbinate += 1;
      if (spesa) {
        speseAbbinate += 1;
        speseCentesimiAbbinati += centesimi ?? 0n;
      }
      const gruppo = perAssegnazione.get(trovato.merchantId) ?? [];
      gruppo.push(riga.id);
      perAssegnazione.set(trovato.merchantId, gruppo);
    }

    if (blocco.length < DIMENSIONE_BLOCCO) break;
  }

  // Le assegnazioni partono tutte insieme, in una chiamata sola.
  //
  // Prima era una `UPDATE` per esercente dentro un `for … await`, e il commento
  // qui diceva «gli esercenti sono quaranta». Sono centosessantasei, e
  // crescono: erano centosessantasei andate e ritorno per rispondere quasi
  // sempre «non e' cambiato niente». La logica di abbinamento resta qui, dove
  // ha i suoi test; cambia solo **come si consegna il risultato**.
  const gruppi: Gruppo[] = [...perAssegnazione.entries()].flatMap(([merchantId, ids]) => {
    const assegnazione = assegnazioni.get(merchantId);
    return assegnazione === undefined ? [] : [{ ...assegnazione, ids }];
  });

  const scritte = await consegna(supabase, gruppi, daSvuotare);

  const daGuardare = [...scoperte.entries()]
    .map(([etichetta, v]) => ({ etichetta, movimenti: v.movimenti, centesimi: v.centesimi }))
    .sort((a, b) => (a.centesimi < b.centesimi ? -1 : a.centesimi > b.centesimi ? 1 : 0))
    .slice(0, 30)
    .map((v) => ({
      etichetta: v.etichetta,
      movimenti: v.movimenti,
      totale: formattaCentesimi(v.centesimi),
    }));

  return {
    esaminate,
    abbinate,
    nonAbbinate: esaminate - abbinate,
    speseEsaminate,
    speseAbbinate,
    speseTotale: formattaCentesimi(speseCentesimi),
    speseTotaleAbbinato: formattaCentesimi(speseCentesimiAbbinati),
    protette: protette ?? 0,
    assegnate: scritte.assegnate,
    svuotate: scritte.svuotate,
    daGuardare,
    importiNonLetti,
  };
}

export type Gruppo = Assegnazione & { ids: readonly string[] };

/**
 * Oltre questo numero di identificativi la chiamata si spezza.
 *
 * Duemila `uuid` sono una settantina di kilobyte di corpo, che va benissimo;
 * ventimila sarebbero settecento, che e' l'altro modo di essere lenti. Non
 * serve oggi e servira' fra due anni — e un tetto che esiste solo quando serve
 * non esiste.
 */
export const IDS_PER_CHIAMATA = 5_000;

/**
 * Consegna le assegnazioni a `applica_assegnazioni` (migration 0057).
 *
 * La funzione SQL confronta prima di scrivere, quindi un giro che non cambia
 * niente non tocca nessuna riga e non fa scattare nessun trigger. E' anche il
 * motivo per cui i due numeri che torna sono informazione e non decorazione.
 */
async function consegna(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  gruppi: readonly Gruppo[],
  daSvuotare: readonly string[],
): Promise<{ assegnate: number; svuotate: number }> {
  let assegnate = 0;
  let svuotate = 0;

  for (const lotto of aLotti(gruppi, daSvuotare)) {
    const { data, error } = await supabase.rpc('applica_assegnazioni', {
      p_gruppi: lotto.gruppi,
      p_da_svuotare: lotto.daSvuotare,
    });

    // L'errore si lancia, non si ingoia: `const { data }` da solo
    // trasformerebbe una funzione assente in «non ho scritto niente», che e' un
    // guasto travestito da risposta. E' la regola pagata provando la 0050.
    if (error !== null) throw new Error(`applica_assegnazioni fallita: ${error.message}`);

    const esito = (data ?? {}) as { assegnate?: unknown; svuotate?: unknown };
    if (typeof esito.assegnate === 'number') assegnate += esito.assegnate;
    if (typeof esito.svuotate === 'number') svuotate += esito.svuotate;
  }

  return { assegnate, svuotate };
}

/**
 * Spezza gruppi e svuotamenti in lotti da `IDS_PER_CHIAMATA` identificativi.
 *
 * Un gruppo non si spezza a meta' se ci sta: spezzarlo non sarebbe sbagliato —
 * la funzione SQL e' rieseguibile e non ha stato — ma renderebbe i due numeri
 * di ritorno piu' difficili da leggere senza guadagnare niente.
 */
export function* aLotti(
  gruppi: readonly Gruppo[],
  daSvuotare: readonly string[],
): Generator<{ gruppi: Gruppo[]; daSvuotare: string[] }> {
  let correnti: Gruppo[] = [];
  let quanti = 0;

  for (const gruppo of gruppi) {
    if (quanti > 0 && quanti + gruppo.ids.length > IDS_PER_CHIAMATA) {
      yield { gruppi: correnti, daSvuotare: [] };
      correnti = [];
      quanti = 0;
    }
    correnti.push(gruppo);
    quanti += gruppo.ids.length;
  }

  if (correnti.length > 0) yield { gruppi: correnti, daSvuotare: [] };

  for (let i = 0; i < daSvuotare.length; i += IDS_PER_CHIAMATA) {
    yield { gruppi: [], daSvuotare: [...daSvuotare.slice(i, i + IDS_PER_CHIAMATA)] };
  }

  // Nessun gruppo e niente da svuotare: si chiama comunque una volta, cosi' il
  // resoconto dice `0` invece di non dire niente.
  if (gruppi.length === 0 && daSvuotare.length === 0) yield { gruppi: [], daSvuotare: [] };
}
