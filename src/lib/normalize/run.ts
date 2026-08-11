import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { comeArray } from '@/lib/enablebanking/redact';
import { normalizzaMovimento, normalizzaNome, PayloadNonNormalizzabile } from './movimento';
import type { AccountRow } from '@/lib/db/types';

/**
 * Normalizzatore: da `raw_transactions` a `transactions`.
 *
 * Rieseguibile sull'intero storico senza effetti collaterali. Le due proprietà
 * che lo rendono tale:
 *
 * 1. **Una riga per `entry_reference`**, non per payload grezzo. Lo stesso
 *    movimento visto prima `PDNG` e poi `BOOK` sta due volte nel registro
 *    grezzo, ma è un movimento solo: si tiene la versione più recente, quindi
 *    la transizione viene riconciliata invece che duplicata.
 * 2. **Le correzioni manuali vincono.** Una riga con `manually_categorized` non
 *    viene più toccata, nemmeno per i campi derivati.
 */

export type EsitoNormalizzazione = {
  esaminate: number;
  girocontiStrutturali: number;
  inserite: number;
  aggiornate: number;
  protette: number;
  scartate: number;
  girocontiSpeculari: number;
  errori: readonly string[];
};

type RigaGrezza = {
  id: number;
  account_id: string;
  source: string;
  payload: Record<string, unknown>;
  fetched_at: string;
};

/**
 * Riferimenti che compaiono su più di un conto nostro.
 *
 * È la prova strutturale che un movimento è un giroconto interno: la banca
 * registra lo stesso `entry_reference` sul conto di partenza e su quello di
 * arrivo. Non c'è niente da interpretare — nessuna causale da confrontare,
 * nessun nome da indovinare — e funziona anche quando la causale è muta.
 *
 * Resta un limite, ed è insuperabile: vale solo se entrambi i lati sono conti
 * collegati. Un bonifico verso un proprio conto presso un'altra banca continua
 * a essere indistinguibile da un bonifico a un terzo, e va marcato a mano.
 */
export function riferimentiSuPiuConti(
  righe: readonly { account_id: string; riferimento: string | null }[],
): ReadonlySet<string> {
  const contiPerRiferimento = new Map<string, Set<string>>();

  for (const riga of righe) {
    if (riga.riferimento === null) continue;
    const conti = contiPerRiferimento.get(riga.riferimento) ?? new Set<string>();
    conti.add(riga.account_id);
    contiPerRiferimento.set(riga.riferimento, conti);
  }

  const condivisi = new Set<string>();
  for (const [riferimento, conti] of contiPerRiferimento) {
    if (conti.size > 1) condivisi.add(riferimento);
  }
  return condivisi;
}

/** Ordina PDNG prima di BOOK, così l'ultima versione vista vince. */
function piuRecente(a: RigaGrezza, b: RigaGrezza): RigaGrezza {
  const statoA = String(a.payload['status'] ?? '').toUpperCase();
  const statoB = String(b.payload['status'] ?? '').toUpperCase();

  // Una versione BOOK batte sempre una PDNG, a prescindere da quando e' stata
  // scaricata: e' lo stato definitivo del movimento.
  if (statoA !== statoB) {
    if (statoB === 'BOOK') return b;
    if (statoA === 'BOOK') return a;
  }
  return b.fetched_at >= a.fetched_at ? b : a;
}

export async function normalizzaTutto(): Promise<EsitoNormalizzazione> {
  const supabase = await createSupabaseServerClient();

  const { data: contiGrezzi } = await supabase.from('accounts').select('*');
  const conti = comeArray<AccountRow>(contiGrezzi);
  const contoPerId = new Map(conti.map((c) => [c.id, c]));
  const { data: controparti } = await supabase.from('own_counterparties').select('label');

  // I conti collegati e le controparti dichiarate finiscono nello stesso
  // elenco: per il riconoscimento sono la stessa cosa, cambia solo da dove
  // arriva l'informazione.
  const nomiContiPropri = [
    ...conti.map((c) => c.name),
    ...comeArray<{ label: string }>(controparti).map((c) => c.label),
  ]
    .filter((n): n is string => typeof n === 'string' && n.trim() !== '')
    .map(normalizzaNome);

  const errori: string[] = [];
  let esaminate = 0;
  let inserite = 0;
  let aggiornate = 0;
  let protette = 0;
  let scartate = 0;

  // Scorre il registro grezzo a blocchi, per non caricare in memoria due anni
  // di payload integrali.
  const DIMENSIONE_BLOCCO = 500;
  let da = 0;

  // Ultima versione per chiave, accumulata mentre si scorre.
  const migliori = new Map<string, RigaGrezza>();
  const riferimentiVisti: { account_id: string; riferimento: string | null }[] = [];

  for (;;) {
    const { data, error } = await supabase
      .from('raw_transactions')
      .select('id, account_id, source, payload, fetched_at')
      .order('id', { ascending: true })
      .range(da, da + DIMENSIONE_BLOCCO - 1);

    if (error !== null) throw new Error(`Lettura raw_transactions fallita: ${error.message}`);

    const blocco = comeArray<RigaGrezza>(data);
    if (blocco.length === 0) break;

    for (const riga of blocco) {
      esaminate += 1;
      const riferimento = riga.payload['entry_reference'];
      const chiave = `${riga.account_id}::${typeof riferimento === 'string' ? riferimento : `raw-${riga.id}`}`;
      riferimentiVisti.push({
        account_id: riga.account_id,
        riferimento: typeof riferimento === 'string' ? riferimento : null,
      });
      const esistente = migliori.get(chiave);
      migliori.set(chiave, esistente === undefined ? riga : piuRecente(esistente, riga));
    }

    if (blocco.length < DIMENSIONE_BLOCCO) break;
    da += DIMENSIONE_BLOCCO;
  }

  // Chiavi gia' presenti e protette da correzione manuale: non si toccano.
  const { data: manualiGrezze } = await supabase
    .from('transactions')
    .select('account_id, match_key')
    .eq('manually_categorized', true);

  const protetteSet = new Set(
    comeArray<{ account_id: string; match_key: string }>(manualiGrezze).map(
      (r) => `${r.account_id}::${r.match_key}`,
    ),
  );

  const girocontiPerRiferimento = riferimentiSuPiuConti(riferimentiVisti);
  let girocontiStrutturali = 0;

  const daScrivere: Record<string, unknown>[] = [];

  for (const riga of migliori.values()) {
    const conto = contoPerId.get(riga.account_id);
    if (conto === undefined) {
      scartate += 1;
      errori.push(`Conto ${riga.account_id} sconosciuto`);
      continue;
    }

    try {
      const movimento = normalizzaMovimento(riga.payload, riga.account_id, {
        valutaConto: conto.currency,
        nomiContiPropri,
      });

      const chiaveEffettiva = movimento.external_id ?? movimento.dedupe_key ?? '';
      if (protetteSet.has(`${riga.account_id}::${chiaveEffettiva}`)) {
        protette += 1;
        continue;
      }

      // Il riconoscimento strutturale si somma a quello per causale: uno vede
      // i giroconti fra conti collegati, l'altro i pocket in valuta di cui
      // registriamo un lato solo.
      const strutturale =
        movimento.external_id !== null && girocontiPerRiferimento.has(movimento.external_id);
      if (strutturale && !movimento.is_transfer) girocontiStrutturali += 1;

      daScrivere.push({
        account_id: riga.account_id,
        raw_transaction_id: riga.id,
        source: riga.source,
        ...movimento,
        is_transfer: movimento.is_transfer || strutturale,
      });
    } catch (errore) {
      scartate += 1;
      if (errore instanceof PayloadNonNormalizzabile) {
        errori.push(`raw ${riga.id}: ${errore.message}`);
      } else {
        errori.push(`raw ${riga.id}: ${errore instanceof Error ? errore.message : String(errore)}`);
      }
    }
  }

  // Quante di queste chiavi esistono gia': serve solo a distinguere inserite da
  // aggiornate nel resoconto, non al funzionamento.
  const { count: primaDi } = await supabase
    .from('transactions')
    .select('*', { count: 'exact', head: true });

  for (let i = 0; i < daScrivere.length; i += 200) {
    const lotto = daScrivere.slice(i, i + 200);
    const { error } = await supabase
      .from('transactions')
      .upsert(lotto, { onConflict: 'account_id,match_key' });

    if (error !== null) {
      throw new Error(`Scrittura transactions fallita: ${error.message}`);
    }
  }

  const { count: dopoDi } = await supabase
    .from('transactions')
    .select('*', { count: 'exact', head: true });

  inserite = (dopoDi ?? 0) - (primaDi ?? 0);
  aggiornate = daScrivere.length - inserite;

  // Rete di sicurezza dietro al riconoscimento per codice e causale.
  // L'errore va riportato, non ingoiato: se questa chiamata fallisce e il
  // risultato resta zero, il resoconto dice "nessun giroconto speculare" — che
  // e' indistinguibile da "la funzione non e' mai stata eseguita".
  const { data: speculari, error: erroreSpeculari } = await supabase.rpc(
    'rileva_giroconti_speculari',
    { giorni: 3 },
  );
  if (erroreSpeculari !== null) {
    errori.push(`rileva_giroconti_speculari: ${erroreSpeculari.message}`);
  }

  return {
    esaminate,
    girocontiStrutturali,
    inserite,
    aggiornate,
    protette,
    scartate,
    girocontiSpeculari: typeof speculari === 'number' ? speculari : 0,
    errori: errori.slice(0, 20),
  };
}
