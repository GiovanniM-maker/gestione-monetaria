import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { comeArray } from '@/lib/enablebanking/redact';
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
  /** Le etichette non abbinate, per spesa decrescente: e' la lista di lavoro. */
  daGuardare: readonly { etichetta: string; movimenti: number; totale: string }[];
};

type RigaDaClassificare = {
  id: string;
  amount: string;
  counterparty_raw: string | null;
  raw_description: string | null;
};

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

  const categorie = new Map(
    comeArray<CategoryRow>(categorieGrezze).map((c) => [c.id, c] as const),
  );

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
  const perAssegnazione = new Map<string, string[]>();
  const daSvuotare: string[] = [];
  const scoperte = new Map<string, { movimenti: number; centesimi: bigint }>();

  for (let da = 0; ; da += DIMENSIONE_BLOCCO) {
    const { data, error } = await supabase
      .from('transactions')
      .select('id, amount, counterparty_raw, raw_description')
      .eq('manually_categorized', false)
      .order('id', { ascending: true })
      .range(da, da + DIMENSIONE_BLOCCO - 1);

    if (error !== null) throw new Error(`Lettura transactions fallita: ${error.message}`);

    const blocco = comeArray<RigaDaClassificare>(data);
    if (blocco.length === 0) break;

    for (const riga of blocco) {
      esaminate += 1;
      const etichetta = etichettaDiRiferimento(riga);
      const trovato = etichetta === null ? null : abbinaMerchant(etichetta, alias);

      if (trovato === null) {
        daSvuotare.push(riga.id);
        if (etichetta !== null) {
          const corrente = scoperte.get(etichetta) ?? { movimenti: 0, centesimi: 0n };
          corrente.movimenti += 1;
          corrente.centesimi += centesimiDaDecimale(riga.amount);
          scoperte.set(etichetta, corrente);
        }
        continue;
      }

      abbinate += 1;
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
      totale: decimaleDaCentesimi(v.centesimi),
    }));

  return {
    esaminate,
    abbinate,
    nonAbbinate: esaminate - abbinate,
    protette: protette ?? 0,
    daGuardare,
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

/**
 * Da stringa decimale a centesimi interi. Duplica di proposito la logica di
 * `parseCentesimi` in forma tollerante: qui un importo malformato non deve far
 * fallire l'intera categorizzazione, perche' serve solo a ordinare una lista.
 */
function centesimiDaDecimale(valore: string): bigint {
  const trovato = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(valore.trim());
  if (trovato === null) return 0n;
  const segno = trovato[1] === '-' ? -1n : 1n;
  const interi = BigInt(trovato[2] ?? '0');
  const decimali = BigInt((trovato[3] ?? '').padEnd(2, '0'));
  return segno * (interi * 100n + decimali);
}

function decimaleDaCentesimi(centesimi: bigint): string {
  const negativo = centesimi < 0n;
  const assoluto = negativo ? -centesimi : centesimi;
  return `${negativo ? '-' : ''}${assoluto / 100n}.${String(assoluto % 100n).padStart(2, '0')}`;
}
