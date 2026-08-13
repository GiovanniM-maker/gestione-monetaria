import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { comeArray } from '@/lib/enablebanking/redact';
import { sanificaMetriche } from '@/lib/report/sanifica';
import type { StrumentoDichiarato } from '@/lib/ai/modello';
import type { Proposta } from './messaggi';

/**
 * Le operazioni che il copilot può usare.
 *
 * ---------------------------------------------------------------------------
 * Perché quasi tutte esistevano già
 * ---------------------------------------------------------------------------
 * La regola scritta in Fase 0 — «ogni operazione dev'essere raggiungibile dal
 * copilot, non solo da un bottone» — si incassa qui. Questo file non contiene
 * nessuna logica di analisi: chiama viste e funzioni SQL che il cruscotto già
 * usa, e le presenta al modello. Se le aggregazioni fossero state scritte
 * dentro i componenti delle schermate, questa fase sarebbe stata riscriverle
 * tutte una seconda volta — e due copie della stessa somma divergono.
 *
 * ---------------------------------------------------------------------------
 * La proiezione è una lista di ciò che può uscire, non di ciò che si nasconde
 * ---------------------------------------------------------------------------
 * Nessun risultato viene passato al modello così com'è. Ogni riga viene
 * ricostruita campo per campo, e la regola 8 impone cosa può stare
 * nell'elenco: nome dell'esercente, importo, data, categoria, aggregati.
 *
 * Restano fuori, e non per dimenticanza:
 *
 * - **`raw_description`** — è la causale grezza della banca, e contiene i nomi
 *   e gli IBAN delle controparti dei bonifici;
 * - **`counterparty_raw`** — la controparte, per definizione;
 * - **`note`** — le scrive l'utente, e può averci scritto qualsiasi cosa;
 * - **il conto** e le ultime cifre della carta.
 *
 * Un elenco di campi ammessi fallisce chiuso: una colonna nuova su
 * `transactions` non compare qui finché qualcuno non la scrive. Una lista di
 * campi da togliere avrebbe la proprietà opposta, ed è la proprietà sbagliata.
 *
 * Sopra la proiezione gira `sanificaMetriche`, che sostituisce con «un privato»
 * ogni `esercente` che non dichiari un'attività commerciale. Per questo ogni
 * nome di esercente, in ogni strumento, sta in un campo che si chiama
 * `esercente`: è quella la chiave che il filtro conosce, e inventarne un
 * sinonimo qui vorrebbe dire scavalcarlo.
 */

export type EsitoStrumento = {
  /** Cosa torna al modello. Già proiettato e sanificato. */
  dati: unknown;
  /** Presente solo per le scritture. */
  proposta?: Proposta;
};

export type Strumento = StrumentoDichiarato & {
  esegui: (argomenti: Record<string, unknown>) => Promise<EsitoStrumento>;
};

export class ArgomentoNonValido extends Error {}

// ---------------------------------------------------------------------------
// Lettura degli argomenti
// ---------------------------------------------------------------------------
// Il modello sbaglia i tipi: manda `"2026-07"` dove serve una data, `"20"`
// dove serve un numero, `null` dove ci si aspetta l'assenza. Si accetta ciò
// che è interpretabile e si rifiuta il resto con un messaggio che gli torna
// indietro come risultato dello strumento, così può correggersi da solo —
// invece di far fallire il giro.

function testo(valore: unknown): string | null {
  if (typeof valore !== 'string') return null;
  const pulito = valore.trim();
  return pulito === '' ? null : pulito;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function identificativo(valore: unknown, campo: string): string | null {
  const t = testo(valore);
  if (t === null) return null;
  if (!UUID.test(t)) throw new ArgomentoNonValido(`${campo} non è un identificativo valido: ${t}`);
  return t;
}

function intero(valore: unknown, predefinito: number, massimo: number): number {
  const n = typeof valore === 'number' ? valore : Number(testo(valore) ?? NaN);
  if (!Number.isFinite(n)) return predefinito;
  return Math.max(1, Math.min(Math.trunc(n), massimo));
}

/**
 * Da `YYYY-MM` (o `YYYY-MM-GG`) al primo del mese.
 *
 * Il mese resta testo fino all'ultimo, come in tutto il cruscotto:
 * `new Date('2026-07-01')` è mezzanotte UTC, che a Roma d'estate sono le 02:00
 * del primo, e un giro di andata e ritorno riporta al 30 giugno.
 */
function primoDelMese(valore: unknown, campo: string): string | null {
  const t = testo(valore);
  if (t === null) return null;
  const trovato = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(t);
  if (trovato === null) {
    throw new ArgomentoNonValido(`${campo} va scritto come AAAA-MM (ricevuto: ${t}).`);
  }
  return `${trovato[1]}-${trovato[2]}-01`;
}

function giorno(valore: unknown, campo: string): string | null {
  const t = testo(valore);
  if (t === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    throw new ArgomentoNonValido(`${campo} va scritto come AAAA-MM-GG (ricevuto: ${t}).`);
  }
  return t;
}

const DISCREZIONALITA = ['essenziale', 'investimento', 'utile', 'voluttuario'] as const;
const CONTESTI = ['personale', 'business'] as const;

function fraQuesti<T extends string>(
  valore: unknown,
  ammessi: readonly T[],
  campo: string,
): T | null {
  const t = testo(valore);
  if (t === null) return null;
  if (!ammessi.includes(t as T)) {
    throw new ArgomentoNonValido(`${campo} ammette solo: ${ammessi.join(', ')} (ricevuto: ${t}).`);
  }
  return t as T;
}

/** Ultimo passaggio prima che i dati lascino il server: la regola 8. */
function fuori(dati: unknown): EsitoStrumento {
  return { dati: sanificaMetriche(dati).metriche };
}

// ---------------------------------------------------------------------------
// Gli schemi dei parametri
// ---------------------------------------------------------------------------

const STRINGA = { type: 'string' } as const;
const PERIODO = {
  da_mese: { type: 'string', description: 'Primo mese incluso, AAAA-MM.' },
  a_mese: { type: 'string', description: 'Ultimo mese incluso, AAAA-MM.' },
} as const;

// ---------------------------------------------------------------------------
// Le letture
// ---------------------------------------------------------------------------

const cercaMovimenti: Strumento = {
  nome: 'cerca_movimenti',
  descrizione:
    'Elenca le singole transazioni, con il totale e il numero di righe di TUTTO ' +
    "l'insieme filtrato (non solo di quelle mostrate). Serve per verificare un " +
    'numero scomponendolo, o per trovare una transazione da correggere.',
  parametri: {
    type: 'object',
    properties: {
      da: { type: 'string', description: 'Prima data inclusa, AAAA-MM-GG.' },
      a: { type: 'string', description: 'Ultima data inclusa, AAAA-MM-GG.' },
      testo: { type: 'string', description: "Cerca nella causale e nel nome dell'esercente." },
      categoria_id: STRINGA,
      esercente_id: STRINGA,
      discrezionalita: { type: 'string', enum: [...DISCREZIONALITA] },
      contesto: { type: 'string', enum: [...CONTESTI] },
      tipo: {
        type: 'string',
        enum: ['spesa', 'entrate', 'giroconti', 'tutti'],
        description:
          "'spesa' (predefinito) sono le uscite reali: esclude giroconti, rimborsi, " +
          "conti fuori dai totali. 'tutti' mostra tutto e ogni riga dice perché è " +
          'fuori dalla spesa.',
      },
      ordine: { type: 'string', enum: ['data', 'importo'] },
      limite: { type: 'integer', description: 'Massimo 50. Predefinito 20.' },
    },
  },
  esegui: async (a) => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc('cerca_movimenti', {
      p_id: null,
      p_da: giorno(a['da'], 'da'),
      p_a: giorno(a['a'], 'a'),
      p_ricerca: testo(a['testo']),
      p_categoria: identificativo(a['categoria_id'], 'categoria_id'),
      p_merchant: identificativo(a['esercente_id'], 'esercente_id'),
      p_discrezionalita: fraQuesti(a['discrezionalita'], DISCREZIONALITA, 'discrezionalita'),
      p_contesto: fraQuesti(a['contesto'], CONTESTI, 'contesto'),
      p_tipo:
        fraQuesti(a['tipo'], ['spesa', 'entrate', 'giroconti', 'tutti'] as const, 'tipo') ??
        'spesa',
      p_ordine: fraQuesti(a['ordine'], ['data', 'importo'] as const, 'ordine') ?? 'data',
      p_limite: intero(a['limite'], 20, 50),
      p_scarto: 0,
    });
    if (error !== null) throw new Error(error.message);

    const righe = comeArray<Record<string, unknown>>(data);
    const prima = righe[0];

    return fuori({
      // I totali stanno fuori dalle righe perché valgono per l'insieme intero,
      // non per la pagina: dentro le righe il modello li leggerebbe come una
      // colonna e li sommerebbe.
      totale_righe: prima === undefined ? 0 : Number(prima['totale_righe']),
      totale_importo: prima?.['totale_importo'] ?? null,
      righe_mostrate: righe.length,
      movimenti: righe.map((r) => ({
        id: r['id'],
        data: r['booking_date'],
        importo: r['amount_eur'] ?? r['amount'],
        valuta: r['currency'],
        esercente: r['esercente'],
        esercente_id: r['merchant_id'],
        categoria: r['categoria'],
        categoria_id: r['category_id'],
        discrezionalita: r['discrezionalita'],
        contesto: r['contesto'],
        stato: r['stato'],
        corretto_a_mano: r['manually_categorized'],
        fuori_dalla_spesa: r['fuori_dalla_spesa'],
      })),
    });
  },
};

const spesaPerCategoria: Strumento = {
  nome: 'spesa_per_categoria',
  descrizione:
    'Spesa per categoria su un intervallo di mesi. Ogni categoria porta già la ' +
    'somma di tutte le sue discendenti; `spesa_diretta` è la quota registrata sul ' +
    'nodo stesso. NON sommare fra categorie: padre e figlie si sovrappongono.',
  parametri: { type: 'object', properties: PERIODO, required: ['da_mese', 'a_mese'] },
  esegui: async (a) => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc('spesa_per_categoria', {
      p_da: primoDelMese(a['da_mese'], 'da_mese'),
      p_a: primoDelMese(a['a_mese'], 'a_mese'),
    });
    if (error !== null) throw new Error(error.message);
    return fuori({ categorie: comeArray(data) });
  },
};

const spesaPerClasse: Strumento = {
  nome: 'spesa_per_classe',
  descrizione:
    'Spesa per classe di discrezionalità e contesto su un intervallo di mesi. ' +
    "È la scomposizione che l'applicazione esiste per produrre.",
  parametri: { type: 'object', properties: PERIODO, required: ['da_mese', 'a_mese'] },
  esegui: async (a) => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc('spesa_per_classe', {
      p_da: primoDelMese(a['da_mese'], 'da_mese'),
      p_a: primoDelMese(a['a_mese'], 'a_mese'),
    });
    if (error !== null) throw new Error(error.message);
    return fuori({ classi: comeArray(data) });
  },
};

const spesaPerEsercente: Strumento = {
  nome: 'spesa_per_esercente',
  descrizione: 'I maggiori esercenti per spesa su un intervallo di mesi.',
  parametri: {
    type: 'object',
    properties: { ...PERIODO, limite: { type: 'integer', description: 'Massimo 50.' } },
    required: ['da_mese', 'a_mese'],
  },
  esegui: async (a) => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc('spesa_per_esercente', {
      p_da: primoDelMese(a['da_mese'], 'da_mese'),
      p_a: primoDelMese(a['a_mese'], 'a_mese'),
      p_limite: intero(a['limite'], 15, 50),
    });
    if (error !== null) throw new Error(error.message);
    return fuori({ esercenti: comeArray(data) });
  },
};

const andamentoMensile: Strumento = {
  nome: 'andamento_mensile',
  descrizione:
    'Spesa reale, entrate e completezza dei dati, mese per mese, dal più recente. ' +
    'Usalo per confrontare un mese con i precedenti.',
  parametri: {
    type: 'object',
    properties: { mesi: { type: 'integer', description: 'Quanti mesi indietro. Massimo 24.' } },
  },
  esegui: async (a) => {
    const supabase = await createSupabaseServerClient();
    const quanti = intero(a['mesi'], 8, 24);

    const [spese, entrate] = await Promise.all([
      supabase
        .from('v_monthly_totals')
        .select(
          'mese, spesa::text, movimenti, senza_cambio, senza_categoria, spesa_senza_categoria::text',
        )
        .order('mese', { ascending: false })
        .limit(quanti),
      supabase
        .from('v_monthly_income')
        .select('mese, entrate::text, movimenti')
        .order('mese', { ascending: false })
        .limit(quanti),
    ]);

    const perMese = new Map(
      comeArray<Record<string, unknown>>(entrate.data).map((r) => [String(r['mese']), r]),
    );

    return fuori({
      mesi: comeArray<Record<string, unknown>>(spese.data).map((r) => ({
        ...r,
        entrate: perMese.get(String(r['mese']))?.['entrate'] ?? null,
      })),
      // Il mese in corso non è confrontabile con un mese intero, e il modello
      // non ha modo di saperlo guardando i numeri: undici giorni contro
      // trentuno sembrano un crollo della spesa.
      avvertenza:
        'Il mese più recente può essere in corso: se lo è, non confrontarlo con i mesi interi, ' +
        'e dillo.',
    });
  },
};

const costoRicorrente: Strumento = {
  nome: 'costo_ricorrente',
  descrizione:
    'La metrica principale: costo ricorrente mensile per classe di discrezionalità. ' +
    'Abbonamenti e abitudini restano SEPARATI e non si sommano mai — un abbonamento ' +
    "si disdice, un'abitudine si cambia. Restituisce anche le singole voci.",
  parametri: {
    type: 'object',
    properties: {
      includi_escluse: {
        type: 'boolean',
        description:
          'Include anche le ricorrenze fuori dalla metrica (meno di tre mesi di ' +
          'presenza, meno di 75 giorni coperti, ferme o disdette). Il loro ' +
          'costo mensile non è affidabile.',
      },
    },
  },
  esegui: async (a) => {
    const supabase = await createSupabaseServerClient();
    const tutte = a['includi_escluse'] === true;

    const voci = supabase
      .from('v_subscriptions')
      .select(
        'id, esercente, merchant_id, categoria, discrezionalita, contesto, tipo, cadence, ' +
          'typical_amount::text, total_amount::text, costo_mensile::text, nella_metrica, ' +
          'first_seen, last_seen, occurrences, status, usage_verdict',
      )
      .order('costo_mensile', { ascending: true, nullsFirst: false })
      .limit(60);

    const [metrica, righe] = await Promise.all([
      supabase
        .from('v_recurring_monthly_cost_by_discretion')
        .select('tipo, discrezionalita, contesto, ricorrenze, costo_mensile::text'),
      tutte ? voci : voci.eq('nella_metrica', true),
    ]);

    return fuori({
      metrica: comeArray(metrica.data),
      voci: comeArray(righe.data),
      avvertenza:
        'Il costo mensile delle voci con `nella_metrica` falso non è affidabile e non ' +
        'entra in nessun totale.',
    });
  },
};

const trovaEsercente: Strumento = {
  nome: 'trova_esercente',
  descrizione:
    "Cerca un esercente per nome e ne restituisce l'identificativo e la " +
    'classificazione. Serve prima di proporre una modifica.',
  parametri: {
    type: 'object',
    properties: { testo: { type: 'string', description: 'Anche solo un frammento del nome.' } },
    required: ['testo'],
  },
  esegui: async (a) => {
    const cercato = testo(a['testo']);
    if (cercato === null) throw new ArgomentoNonValido('Serve un testo da cercare.');

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('merchants')
      .select(
        'id, canonical_name, category_id, discretion, context, is_subscription, origine, confermato_at',
      )
      // `%` e `_` sono i jolly di `like`: lasciarli passare da un testo scritto
      // dal modello farebbe rispondere l'intera tabella a una ricerca vuota.
      .ilike('canonical_name', `%${cercato.replace(/[%_\\]/g, '\\$&')}%`)
      .limit(15);

    if (error !== null) throw new Error(error.message);

    return fuori({
      esercenti: comeArray<Record<string, unknown>>(data).map((m) => ({
        id: m['id'],
        esercente: m['canonical_name'],
        categoria_id: m['category_id'],
        discrezionalita: m['discretion'],
        contesto: m['context'],
        abbonamento: m['is_subscription'],
        proposto_dal_modello: m['origine'] === 'ai' && m['confermato_at'] === null,
      })),
    });
  },
};

const statoEAvvisi: Strumento = {
  nome: 'stato_e_avvisi',
  descrizione:
    'Stato del collegamento bancario (scadenza del consenso, ultima ' +
    'sincronizzazione) e avvisi aperti. Usalo quando la domanda riguarda ' +
    "l'affidabilità dei dati o cosa richiede una decisione.",
  parametri: { type: 'object', properties: {} },
  esegui: async () => {
    const supabase = await createSupabaseServerClient();

    const [stato, avvisi] = await Promise.all([
      supabase.from('v_stato_sistema').select('*'),
      supabase
        .from('alerts')
        .select('id, type, severity, created_at, subscriptions(merchants(canonical_name))')
        .eq('status', 'new')
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    // Il **titolo** dell'avviso non esce. «Netflix: il prezzo è salito» è una
    // frase che contiene un nome, e un filtro che decide se un nome può uscire
    // non sa cosa farne: la lascerebbe passare intera o la sostituirebbe
    // intera. Si manda il nome in un campo suo, e la frase la compone il
    // modello. È la stessa scelta fatta in `metriche_report`.
    const aperti = comeArray<Record<string, unknown>>(avvisi.data).map((a) => {
      const sub = a['subscriptions'] as { merchants?: { canonical_name?: unknown } } | null;
      return {
        tipo: a['type'],
        gravita: a['severity'],
        quando: a['created_at'],
        esercente:
          typeof sub?.merchants?.canonical_name === 'string' ? sub.merchants.canonical_name : null,
      };
    });

    return fuori({ collegamenti: comeArray(stato.data), avvisi_aperti: aperti });
  },
};

// ---------------------------------------------------------------------------
// Le scritture — che qui non scrivono
// ---------------------------------------------------------------------------
// Ognuna **prepara** l'operazione e la restituisce; ad applicarla è l'utente,
// con un tocco, dopo aver letto cosa succede.
//
// Non è diffidenza verso il modello, è dove sta l'informazione. Il flag
// `manually_categorized` significa «questa riga fa eccezione perché l'ho
// deciso io», e blocca per sempre ogni automatismo su quella riga: è la cosa
// più vicina a un'incisione che ci sia nello schema. Farlo scattare
// sull'interpretazione di una frase — «sposta quella spesa di ieri» — vorrebbe
// dire che il patto delle regole di correttezza, «le correzioni manuali
// dell'utente sono sacre», protegge una decisione che l'utente non ha preso.
//
// Il costo è un tocco. Il ricavo è che ogni scrittura di questa applicazione
// resta attribuibile a chi l'ha voluta.

async function nomeEsercente(id: string): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('merchants')
    .select('canonical_name')
    .eq('id', id)
    .maybeSingle<{ canonical_name: string }>();
  if (data === null) throw new ArgomentoNonValido(`Nessun esercente con identificativo ${id}.`);
  return data.canonical_name;
}

async function nomeCategoria(id: string): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('v_categorie_albero')
    .select('percorso')
    .eq('id', id)
    .maybeSingle<{ percorso: string }>();
  if (data === null) throw new ArgomentoNonValido(`Nessuna categoria con identificativo ${id}.`);
  return data.percorso;
}

/**
 * Cosa vede il modello dopo aver preparato una scrittura.
 *
 * La descrizione **non gli torna indietro**: contiene il nome vero
 * dell'esercente, che potrebbe essere quello di un privato, e la regola 8 non
 * fa eccezioni per i messaggi di servizio. Il modello sa che la proposta è
 * pronta, l'utente legge cosa fa.
 */
const PREPARATA = {
  esito: 'proposta_preparata',
  nota:
    "L'operazione NON è stata eseguita: è in attesa che l'utente la applichi con un " +
    'tocco. Dillo, e non dare per fatto il cambiamento.',
};

const correggiMovimento: Strumento = {
  nome: 'correggi_movimento',
  descrizione:
    'Prepara la correzione di UNA transazione: vale solo per quella riga e la ' +
    "protegge da ogni riclassificazione automatica successiva. Usalo quando l'acquisto " +
    'fa eccezione rispetto al suo esercente (un computer comprato per lavorare in un ' +
    'negozio dove di solito si comprano sciocchezze). Per cambiare la classificazione ' +
    'di tutte le spese di un esercente usa invece aggiorna_esercente.',
  parametri: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Identificativo del movimento.' },
      discrezionalita: { type: 'string', enum: [...DISCREZIONALITA] },
      contesto: { type: 'string', enum: [...CONTESTI] },
      note: { type: 'string', description: 'Perché fa eccezione.' },
    },
    required: ['id'],
  },
  esegui: async (a) => {
    const id = identificativo(a['id'], 'id');
    if (id === null) throw new ArgomentoNonValido("Serve l'identificativo del movimento.");

    const discrezionalita = fraQuesti(a['discrezionalita'], DISCREZIONALITA, 'discrezionalita');
    const contesto = fraQuesti(a['contesto'], CONTESTI, 'contesto');
    const note = testo(a['note']);

    if (discrezionalita === null && contesto === null && note === null) {
      throw new ArgomentoNonValido(
        'Non c’è niente da cambiare: indica discrezionalita, contesto o note.',
      );
    }

    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.rpc('cerca_movimenti', {
      p_id: id,
      p_tipo: 'tutti',
      p_limite: 1,
    });
    const riga = comeArray<Record<string, unknown>>(data)[0];
    if (riga === undefined)
      throw new ArgomentoNonValido(`Nessun movimento con identificativo ${id}.`);

    const cambi = [
      discrezionalita !== null ? `discrezionalità → ${discrezionalita}` : null,
      contesto !== null ? `contesto → ${contesto}` : null,
      note !== null ? `nota: «${note}»` : null,
    ].filter((c): c is string => c !== null);

    return {
      dati: PREPARATA,
      proposta: {
        operazione: 'correggi_movimento',
        argomenti: { id, discrezionalita, contesto, note },
        descrizione:
          `Correggi il movimento del ${String(riga['booking_date'])} ` +
          `da ${String(riga['esercente'] ?? 'esercente sconosciuto')} ` +
          `(${String(riga['amount_eur'] ?? riga['amount'])} €): ${cambi.join(', ')}. ` +
          'Vale solo per questa riga, che da qui in poi nessun automatismo toccherà più.',
      },
    };
  },
};

const aggiornaEsercente: Strumento = {
  nome: 'aggiorna_esercente',
  descrizione:
    'Prepara il cambio di classificazione di un esercente. Vale per TUTTE le sue ' +
    'spese, passate e future, tranne quelle già corrette a mano. È il modo normale ' +
    'di spostare una spesa di categoria.',
  parametri: {
    type: 'object',
    properties: {
      id: { type: 'string', description: "Identificativo dell'esercente." },
      categoria_id: STRINGA,
      discrezionalita: { type: 'string', enum: [...DISCREZIONALITA] },
      contesto: { type: 'string', enum: [...CONTESTI] },
      abbonamento: {
        type: 'boolean',
        description:
          'true se è un contratto che si può disdire. È ciò che separa gli abbonamenti ' +
          'dalle abitudini nella metrica principale.',
      },
    },
    required: ['id'],
  },
  esegui: async (a) => {
    const id = identificativo(a['id'], 'id');
    if (id === null) throw new ArgomentoNonValido("Serve l'identificativo dell'esercente.");

    const categoriaId = identificativo(a['categoria_id'], 'categoria_id');
    const discrezionalita = fraQuesti(a['discrezionalita'], DISCREZIONALITA, 'discrezionalita');
    const contesto = fraQuesti(a['contesto'], CONTESTI, 'contesto');
    const abbonamento = typeof a['abbonamento'] === 'boolean' ? a['abbonamento'] : null;

    if (
      categoriaId === null &&
      discrezionalita === null &&
      contesto === null &&
      abbonamento === null
    ) {
      throw new ArgomentoNonValido('Non c’è niente da cambiare.');
    }

    const nome = await nomeEsercente(id);
    const cambi = [
      categoriaId !== null ? `categoria → ${await nomeCategoria(categoriaId)}` : null,
      discrezionalita !== null ? `discrezionalità → ${discrezionalita}` : null,
      contesto !== null ? `contesto → ${contesto}` : null,
      abbonamento !== null
        ? abbonamento
          ? 'marcalo come abbonamento'
          : 'marcalo come abitudine'
        : null,
    ].filter((c): c is string => c !== null);

    return {
      dati: PREPARATA,
      proposta: {
        operazione: 'aggiorna_esercente',
        argomenti: { id, categoria_id: categoriaId, discrezionalita, contesto, abbonamento },
        descrizione:
          `${nome}: ${cambi.join(', ')}. Vale per tutte le sue spese, passate e future, ` +
          'tranne quelle già corrette a mano.',
      },
    };
  },
};

const creaCategoria: Strumento = {
  nome: 'crea_categoria',
  descrizione:
    "Prepara una categoria nuova. Prima verifica nell'albero qui sopra che non " +
    'esista già con un altro nome: una tassonomia che si moltiplica smette di dire ' +
    'dove vanno i soldi.',
  parametri: {
    type: 'object',
    properties: {
      nome: STRINGA,
      padre_id: { type: 'string', description: 'Categoria sotto cui appenderla.' },
      discrezionalita_predefinita: { type: 'string', enum: [...DISCREZIONALITA] },
    },
    required: ['nome'],
  },
  esegui: async (a) => {
    const nome = testo(a['nome']);
    if (nome === null) throw new ArgomentoNonValido('Serve il nome della categoria.');

    const padreId = identificativo(a['padre_id'], 'padre_id');
    const predefinita = fraQuesti(
      a['discrezionalita_predefinita'],
      DISCREZIONALITA,
      'discrezionalita_predefinita',
    );

    const sotto = padreId === null ? null : await nomeCategoria(padreId);

    return {
      dati: PREPARATA,
      proposta: {
        operazione: 'crea_categoria',
        argomenti: { nome, padre_id: padreId, discrezionalita_predefinita: predefinita },
        descrizione:
          `Crea la categoria «${nome}»${sotto === null ? ' al primo livello' : ` sotto ${sotto}`}` +
          `${predefinita === null ? '' : `, discrezionalità predefinita ${predefinita}`}.`,
      },
    };
  },
};

export const STRUMENTI: readonly Strumento[] = [
  cercaMovimenti,
  spesaPerCategoria,
  spesaPerClasse,
  spesaPerEsercente,
  andamentoMensile,
  costoRicorrente,
  trovaEsercente,
  statoEAvvisi,
  correggiMovimento,
  aggiornaEsercente,
  creaCategoria,
];

export function strumento(nome: string): Strumento | undefined {
  return STRUMENTI.find((s) => s.nome === nome);
}
