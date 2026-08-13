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
 * Cosa si scrive sulla transazione. Tutti i campi ammettono `null` perche' lo
 * svuotamento e' un'assegnazione come le altre, non un caso speciale: e' cio'
 * che rende il ricalcolo davvero un ricalcolo.
 */
type Assegnazione = {
  merchant_id: string | null;
  category_id: string | null;
  discretion: Discretion | null;
  context: Context | null;
};

const NESSUNA_ASSEGNAZIONE: Assegnazione = {
  merchant_id: null,
  category_id: null,
  discretion: null,
  context: null,
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

  // Una UPDATE per esercente invece di una per riga: gli esercenti sono
  // quaranta, le transazioni duemila.
  for (const [merchantId, ids] of perAssegnazione) {
    const assegnazione = assegnazioni.get(merchantId);
    if (assegnazione === undefined) continue;
    await aggiornaAScaglioni(supabase, ids, assegnazione);
  }

  await aggiornaAScaglioni(supabase, daSvuotare, NESSUNA_ASSEGNAZIONE);

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
    daGuardare,
    importiNonLetti,
  };
}

async function aggiornaAScaglioni(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  ids: readonly string[],
  assegnazione: Assegnazione,
): Promise<void> {
  // `in` su un elenco sterminato produce una URL che il server rifiuta.
  const SCAGLIONE = 200;
  for (let i = 0; i < ids.length; i += SCAGLIONE) {
    const { error } = await supabase
      .from('transactions')
      .update(assegnazione)
      .in('id', ids.slice(i, i + SCAGLIONE));

    if (error !== null) throw new Error(`Aggiornamento transactions fallito: ${error.message}`);
  }
}
