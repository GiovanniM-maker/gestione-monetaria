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
  /**
   * Movimenti distinti ottenuti dalle righe grezze esaminate.
   *
   * Puo' essere minore di `esaminate` senza che niente sia andato perso: la
   * stessa transazione viene riletta quando passa da `pending` a `booked`, e
   * le due righe grezze collassano su un movimento solo. Senza questo numero
   * la differenza sembra una perdita — e' successo, e mi ha portato a
   * dichiarare "quattro righe scartate" quando le scartate erano zero.
   */
  distinti: number;
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
 *
 * ---------------------------------------------------------------------------
 * Non la chiama più nessuno, e resta lo stesso
 * ---------------------------------------------------------------------------
 * Dalla `0057` il riconoscimento vive in `rileva_giroconti_strutturali()`, che
 * fa la stessa cosa in una query invece che leggendo 884 kB di registro grezzo
 * dentro Node — ed è proprio quella lettura che impediva a `normalizzaTutto` di
 * guardare una finestra.
 *
 * Questa funzione resta perché **è la definizione**, con i suoi test: la
 * versione SQL è un'implementazione di ciò che è scritto qui, e se le due
 * divergessero è da qui che si capisce quale delle due ha ragione.
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

export type OpzioniNormalizzazione = {
  /**
   * Quanti giorni indietro guardare nel registro grezzo. `null` = tutto.
   *
   * ---------------------------------------------------------------------------
   * Perche' restringere qui e' sicuro, mentre di solito non lo e'
   * ---------------------------------------------------------------------------
   * Una finestra troppo stretta lascia fuori un movimento che nessuno vedra'
   * mancare: e' il modo di sbagliare peggiore, perche' silenzioso. Qui pero'
   * c'e' un argomento strutturale, e regge solo finche' restano vere tutte e
   * quattro le righe:
   *
   * 1. `raw_transactions` e' **immutabile** e unica su `(account_id,
   *    payload_hash)`. Una riga grezza non cambia mai; un payload cambiato e'
   *    una riga **nuova**, con un `fetched_at` nuovo.
   * 2. Quindi per una riga invariata `normalizzaMovimento` produce sempre lo
   *    stesso risultato — **tranne** se cambia il codice del normalizzatore (un
   *    deploy) o `nomiContiPropri`, cioe' i nomi dei conti e
   *    `own_counterparties`.
   * 3. `own_counterparties` non ha nessun percorso di scrittura
   *    nell'applicazione; i nomi dei conti li cambia solo `abbinaConti`, che
   *    infatti forza una normalizzazione completa.
   * 4. Il profilo **completo** gira quattro volte al giorno **senza finestra**,
   *    e copre entrambi i casi.
   *
   * Se una di queste smette di valere, questa opzione va tolta.
   * Il ragionamento per esteso sta in `docs/prestazioni-rimedi.md` §4.
   */
  giorniIndietro?: number | null;
};

/**
 * La finestra del profilo veloce: il **doppio** di quella di scarico.
 *
 * Non e' prudenza generica. Lo scarico chiede sette giorni indietro, quindi
 * tutto cio' che il giro veloce puo' aver portato e' entrato nel registro nelle
 * ultime ore. Quattordici coprono anche il caso in cui il giro completo sia
 * fermo da una settimana — che e' successo, per tre giorni, nell'agosto 2026.
 */
export const FINESTRA_VELOCE_GIORNI = 14;

export async function normalizzaTutto(
  opzioni: OpzioniNormalizzazione = {},
): Promise<EsitoNormalizzazione> {
  const giorniIndietro = opzioni.giorniIndietro ?? null;
  const soglia =
    giorniIndietro === null
      ? null
      : new Date(Date.now() - giorniIndietro * 86_400_000).toISOString();

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

  for (;;) {
    let query = supabase
      .from('raw_transactions')
      .select('id, account_id, source, payload, fetched_at')
      .order('id', { ascending: true })
      .range(da, da + DIMENSIONE_BLOCCO - 1);

    // La finestra, quando c'e'. Senza, si legge tutto il registro: e' cio' che
    // il profilo completo deve continuare a fare.
    if (soglia !== null) query = query.gte('fetched_at', soglia);

    const { data, error } = await query;

    if (error !== null) throw new Error(`Lettura raw_transactions fallita: ${error.message}`);

    const blocco = comeArray<RigaGrezza>(data);
    if (blocco.length === 0) break;

    for (const riga of blocco) {
      esaminate += 1;
      const riferimento = riga.payload['entry_reference'];
      const chiave = `${riga.account_id}::${typeof riferimento === 'string' ? riferimento : `raw-${riga.id}`}`;
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

      // Il riconoscimento strutturale non e' piu' qui: lo fa
      // `rileva_giroconti_strutturali()` dopo la scrittura, in SQL, perche'
      // per farlo in memoria bisognava leggere l'intero registro grezzo.
      // Si scrive quindi il solo `is_transfer` che si legge dalla causale e dal
      // codice, e la RPC ci somma la prova strutturale subito dopo.
      daScrivere.push({
        account_id: riga.account_id,
        raw_transaction_id: riga.id,
        source: riga.source,
        ...movimento,
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

  // Il riconoscimento strutturale, in SQL e in un viaggio solo.
  //
  // Va **dopo** la scrittura, non prima: l'upsert ha appena riscritto
  // `is_transfer` con il solo valore che si legge dalla causale, quindi per
  // qualche istante un giroconto strutturale risulta falso. Nessuno sta
  // guardando — e' lavoro di sfondo — e alla fine lo stato e' identico, ma va
  // saputo prima di vederlo in una query lanciata nel momento sbagliato.
  const { data: strutturali, error: erroreStrutturali } = await supabase.rpc(
    'rileva_giroconti_strutturali',
  );
  if (erroreStrutturali !== null) {
    errori.push(`rileva_giroconti_strutturali: ${erroreStrutturali.message}`);
  }

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
    distinti: migliori.size,
    // Quanti ne ha marcati **di nuovi**, non quanti ne ha visti: e' il numero
    // che dice se e' successo qualcosa, e prima non era ottenibile.
    girocontiStrutturali: typeof strutturali === 'number' ? strutturali : 0,
    inserite,
    aggiornate,
    protette,
    scartate,
    girocontiSpeculari: typeof speculari === 'number' ? speculari : 0,
    errori: errori.slice(0, 20),
  };
}
