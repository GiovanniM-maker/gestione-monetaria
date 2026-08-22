import 'server-only';
import { leggiClassi } from '@/lib/tassonomia/classi';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { comeArray } from '@/lib/enablebanking/redact';
import { sanificaMetriche } from '@/lib/report/sanifica';
import { esercentiDaCarta } from '@/lib/tassonomia/garanzie';
import type { StrumentoDichiarato } from '@/lib/ai/modello';
import type { Grafico, Proposta } from './messaggi';
import { descriviObiettivo, leggiObiettivi, TIPI_OBIETTIVO } from './obiettivi';

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
  /** Presente solo per i grafici. Va all'utente, non al modello. */
  grafico?: Grafico;
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

const CONTESTI = ['personale', 'business'] as const;

/**
 * La classe di discrezionalita' negli argomenti del modello.
 *
 * Non e' un `enum` nello schema, e non e' una svista. Le dichiarazioni degli
 * strumenti sono costanti — si costruiscono una volta e valgono per tutte le
 * conversazioni — mentre le classi si creano e si archiviano mentre l'app e'
 * accesa. Un `enum` congelato all'avvio rifiuterebbe una classe creata dieci
 * minuti prima, e lo farebbe con l'errore piu' confondente possibile: «non e'
 * un valore ammesso» per una cosa che l'utente ha appena creato.
 *
 * L'elenco vero il modello ce l'ha nelle istruzioni, dove viene riscritto a
 * ogni conversazione, e la validazione avviene qui — al momento di eseguire,
 * cioe' quando si sa cosa esiste davvero.
 */
const CLASSE: Record<string, unknown> = {
  type: 'string',
  description:
    'Slug di una classe di discrezionalità, fra quelle elencate nelle istruzioni. ' +
    'Non inventarne.',
};

async function classeValida(valore: unknown, campo = 'discrezionalita'): Promise<string | null> {
  const t = testo(valore);
  if (t === null) return null;
  const classi = (await leggiClassi()).filter((c) => !c.is_archived).map((c) => c.slug);
  if (!classi.includes(t)) {
    throw new ArgomentoNonValido(`${campo} ammette solo: ${classi.join(', ')} (ricevuto: ${t}).`);
  }
  return t;
}

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

/**
 * Ultimo passaggio prima che i dati lascino il server: la regola 8.
 *
 * La garanzia della carta si rilegge a ogni chiamata invece di tenerla in
 * memoria. È una query su un centinaio di righe contro una chiamata a un
 * modello: il costo non si misura. Una cache la renderebbe invece **stantia**
 * proprio quando serve — l'esercente creato dieci secondi fa da una proposta
 * appena applicata è esattamente quello di cui si sta parlando.
 */
async function fuori(dati: unknown): Promise<EsitoStrumento> {
  return { dati: sanificaMetriche(dati, await esercentiDaCarta()).metriche };
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
      discrezionalita: CLASSE,
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
      p_discrezionalita: await classeValida(a['discrezionalita']),
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
        // I fatti che l'utente ha dichiarato su QUESTA riga. Arrivano accanto
        // alla riga che descrivono, non in un blocco di «memoria»: sono
        // verificabili dove stanno, e spariscono insieme al movimento se il
        // movimento non viene chiesto.
        episodico: r['episodico'],
        rimborso:
          r['rimborso_stato'] === null
            ? null
            : { stato: r['rimborso_stato'], importo: r['rimborso_importo'] },
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

    // `senza_classe` arriva con la 0060: quanto resta fuori dalla ripartizione
    // per classe, che e' la metrica per cui l'applicazione esiste. Sono due
    // numeri e non dei nomi, quindi `fuori` non ha niente da sanificare.
    //
    // Con il ripiego sulle colonne vecchie, per la stessa ragione di
    // `leggiTotali`: fra il deploy e il SQL editor c'e' una finestra in cui il
    // codice nuovo parla a un database vecchio, e li' una `select` rifiutata
    // farebbe rispondere al copilota «non ho nessun mese» — un guasto
    // travestito da risposta, che e' la lezione della 0050.
    const VECCHIE =
      'mese, spesa::text, movimenti, senza_cambio, senza_categoria, spesa_senza_categoria::text';
    const mensili = async (colonne: string) =>
      supabase
        .from('v_monthly_totals')
        .select(colonne)
        .order('mese', { ascending: false })
        .limit(quanti);

    const [spese, entrate] = await Promise.all([
      mensili(`${VECCHIE}, senza_classe, spesa_senza_classe::text`).then((r) =>
        r.error === null ? r : mensili(VECCHIE),
      ),
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
        'id, canonical_name, category_id, discretion, context, is_subscription, origine, ' +
          'confermato_at, classificazione_variabile',
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
        // Dichiarato variabile = sotto questo nome convivono spese diverse, e
        // la categoria si decide riga per riga. Serve al modello per non
        // proporre un cambio d'esercente quando la sede giusta e' la riga.
        classificazione_riga_per_riga: m['classificazione_variabile'],
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
// I consigli
// ---------------------------------------------------------------------------
// «Come potrei spendere meno per mettere più soldi di lato» è **la** domanda per
// cui questa applicazione esiste, e la prima volta che gliel'hanno fatta il
// copilot ha risposto con un menu: «dimmi cosa vuoi sapere e ti aiuto». Non era
// pigrizia del modello — aveva otto strumenti e nessun motivo per preferirne
// uno, quindi ha chiesto.
//
// La risposta non è insegnargli a scegliere: è che a quella domanda servono
// **tutti** i pezzi insieme, e quindi devono arrivare in una chiamata sola. Il
// costo ricorrente diviso fra abbonamenti e abitudini, le voci che lo compongono,
// i maggiori esercenti dei mesi recenti, e quanto resta ogni mese.
//
// Il margine lo calcola SQL. È una sottrazione — entrate meno spesa — e la
// regola non fa eccezioni per le sottrazioni facili: è proprio su quelle che il
// controllo delle cifre lo ha già colto.

const doveTagliare: Strumento = {
  nome: 'dove_tagliare',
  descrizione:
    'Tutto quello che serve per rispondere a «come posso spendere meno» o «dove ' +
    'posso tagliare» o «come metto via più soldi»: il costo ricorrente diviso fra ' +
    'abbonamenti e abitudini, le singole voci, i maggiori esercenti recenti e ' +
    'quanto resta ogni mese. Chiamalo SUBITO quando la domanda è di questo tipo, ' +
    "invece di chiedere all'utente cosa vuole guardare.",
  parametri: {
    type: 'object',
    properties: {
      mesi: { type: 'integer', description: 'Quanti mesi guardare indietro. Predefinito 3.' },
    },
  },
  esegui: async (a) => {
    const supabase = await createSupabaseServerClient();
    const mesi = intero(a['mesi'], 3, 12);

    // Il primo del mese, `mesi - 1` mesi fa. Con anno e mese come interi la
    // domanda «qual è il mese prima di gennaio» ha una sola risposta, mentre
    // `setMonth` su una data letta in UTC riporterebbe al giorno prima.
    const oggi = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
    const anno = Number(oggi.slice(0, 4));
    const mese = Number(oggi.slice(5, 7));
    const indietro = new Date(Date.UTC(anno, mese - 1 - (mesi - 1), 1));
    const da = `${indietro.toISOString().slice(0, 7)}-01`;
    const a_ = `${oggi.slice(0, 7)}-01`;

    const [metrica, voci, esercenti, margine] = await Promise.all([
      supabase
        .from('v_recurring_monthly_cost_by_discretion')
        .select('tipo, discrezionalita, contesto, ricorrenze, costo_mensile::text'),
      // Tre cifre per voce, non una. `costo_mensile` da solo aveva fatto
      // scrivere «Anthropic −91,26 €/mese, risparmio certo» per un servizio
      // che oggi ne costa 110: è la media su tutto lo storico, e risponde a
      // un'altra domanda.
      supabase.rpc('ricorrenti_con_recente', { p_mesi: 3 }),
      supabase.rpc('spesa_per_esercente', { p_da: da, p_a: a_, p_limite: 12 }),
      supabase.rpc('margine_mensile', { p_mesi: Math.max(mesi, 6) }),
    ]);

    return fuori({
      periodo_esercenti: { da_mese: da.slice(0, 7), a_mese: a_.slice(0, 7) },
      costo_ricorrente: comeArray(metrica.data),
      voci_ricorrenti: comeArray(voci.data),
      maggiori_esercenti: comeArray(esercenti.data),
      margine_mensile: comeArray(margine.data),
      come_leggerli: [
        'ABBONAMENTI e ABITUDINI non si sommano mai: il primo si disdice con un gesto e il ' +
          "risparmio è certo, la seconda si cambia e cambiare un'abitudine non è un gesto.",
        'Ogni voce ha TRE cifre che rispondono a domande diverse. Per «quanto risparmio se ' +
          'disdico» usa media_mensile_recente (quanto è uscito davvero negli ultimi mesi ' +
          'interi) oppure ultimo_importo. media_su_tutto_lo_storico è la media da quando la ' +
          'serie esiste: per un servizio a consumo cresciuto nel tempo è molto più bassa del ' +
          'prezzo di oggi, e spacciarla per un risparmio è falso.',
        'Se le tre cifre coincidono è un canone stabile e puoi citarne una qualsiasi. Se ' +
          'divergono, stabilita_importo bassa lo conferma: è un servizio a consumo, dillo e ' +
          'cita la cifra recente.',
        'stabilita_importo vicina a 0 con prezzo_tipico molto sotto media_mensile_recente ' +
          'significa che sotto quel nome convivono cose diverse — un canone piccolo e degli ' +
          "acquisti singoli. NON dire che si disdice risparmiando la media: non c'è una cosa " +
          'sola da disdire. Dillo, e proponi di separarlo o di non trattarlo come abbonamento.',
        "usage_verdict = 'non_usato' è una dichiarazione dell'utente: quella voce è la prima " +
          'da proporre, perché sta pagando per qualcosa che ha già detto di non usare.',
        "Una voce di viaggi con poche occorrenze concentrate NON è un'abitudine: è una spesa " +
          'episodica che capita di essere ravvicinata, e proporre di «cambiarla» non ha senso.',
        'margine è quanto è rimasto quel mese, già calcolato. Non ricalcolarlo.',
      ],
    });
  },
};

// ---------------------------------------------------------------------------
// I grafici
// ---------------------------------------------------------------------------
// Il modello sceglie **cosa** disegnare, non cosa c'è dentro: i punti escono da
// una query come tutte le altre cifre. Un grafico i cui valori li scrivesse lui
// sarebbe la cosa più pericolosa dell'applicazione — un numero sbagliato in un
// grafico non lo ricontrolla nessuno, perché una figura si guarda, non si legge.
//
// Le etichette sono **sempre mesi**. È anche il motivo per cui non esiste un
// grafico per esercente: le sue etichette sarebbero nomi, e metà diventerebbero
// «un privato» — un grafico con cinque colonne chiamate allo stesso modo non è
// un grafico.

const COSE = ['spesa', 'entrate_e_spesa', 'margine', 'categoria'] as const;

const graficoMensile: Strumento = {
  nome: 'grafico_mensile',
  descrizione:
    "Disegna un grafico dell'andamento mese per mese. Usalo quando ti chiedono un " +
    'grafico, oppure quando la domanda riguarda un andamento nel tempo: una figura ' +
    'dice in un colpo quello che dieci righe di numeri non dicono. Restituisce anche ' +
    'i valori, che puoi commentare.',
  parametri: {
    type: 'object',
    properties: {
      cosa: {
        type: 'string',
        enum: [...COSE],
        description:
          "'spesa' = spesa reale mensile; 'entrate_e_spesa' = le due insieme; " +
          "'margine' = quanto resta ogni mese; 'categoria' = la spesa di una " +
          'categoria (richiede categoria_id).',
      },
      categoria_id: STRINGA,
      mesi: { type: 'integer', description: 'Quanti mesi. Predefinito 8, massimo 24.' },
    },
    required: ['cosa'],
  },
  esegui: async (a) => {
    const cosa = fraQuesti(a['cosa'], COSE, 'cosa') ?? 'spesa';
    const mesi = intero(a['mesi'], 8, 24);
    const supabase = await createSupabaseServerClient();

    if (cosa === 'categoria') {
      const categoriaId = identificativo(a['categoria_id'], 'categoria_id');
      if (categoriaId === null) {
        throw new ArgomentoNonValido('Per il grafico di una categoria serve categoria_id.');
      }

      const { data } = await supabase
        .from('v_monthly_by_category')
        .select('mese, categoria, spesa::text')
        .eq('category_id', categoriaId)
        .order('mese', { ascending: false })
        .limit(mesi);

      const righe = comeArray<{ mese: string; categoria: string; spesa: string }>(data)
        .slice()
        .reverse();

      const nome = righe[0]?.categoria ?? 'categoria';
      return conGrafico(
        righe.map((r) => ({ mese: r.mese, valori: { [nome]: r.spesa } })),
        {
          titolo: `${nome}, ultimi ${righe.length} mesi`,
          tipo: 'barre',
          // Un mese senza spesa in questa categoria non compare nella vista, e
          // quindi non compare nel grafico: la linea salta da marzo a maggio come
          // se aprile non fosse esistito. Va detto, non lasciato indovinare.
          nota: 'I mesi senza nessuna spesa in questa categoria non compaiono.',
        },
      );
    }

    const { data } = await supabase.rpc('margine_mensile', { p_mesi: mesi });
    const righe = comeArray<Record<string, unknown>>(data).slice().reverse();

    const serie =
      cosa === 'spesa'
        ? { spesa: 'spesa' }
        : cosa === 'margine'
          ? { margine: 'margine' }
          : { entrate: 'entrate', spesa: 'spesa' };

    return conGrafico(
      righe.map((r) => ({
        mese: String(r['mese']),
        valori: Object.fromEntries(
          Object.entries(serie).map(([nome, colonna]) => [nome, String(r[colonna] ?? '0')]),
        ),
      })),
      {
        titolo:
          cosa === 'spesa'
            ? `Spesa reale, ultimi ${righe.length} mesi`
            : cosa === 'margine'
              ? `Quanto è rimasto, ultimi ${righe.length} mesi`
              : `Entrate e spesa, ultimi ${righe.length} mesi`,
        tipo: cosa === 'margine' ? 'barre' : 'linee',
      },
    );
  },
};

/**
 * Compone il grafico e i dati dagli stessi punti.
 *
 * Sono la stessa cosa vista due volte, ed è voluto: se la figura e i numeri
 * commentati venissero da due query, potrebbero divergere — e la divergenza si
 * noterebbe solo per caso, guardando bene una figura. È lo stesso ragionamento
 * di `cerca_movimenti`, che restituisce righe e totale da una query sola.
 */
async function conGrafico(
  punti: readonly { mese: string; valori: Record<string, string> }[],
  forma: { titolo: string; tipo: 'linee' | 'barre'; nota?: string },
): Promise<EsitoStrumento> {
  const nomi = [...new Set(punti.flatMap((p) => Object.keys(p.valori)))];

  const grafico: Grafico = {
    titolo: forma.titolo,
    tipo: forma.tipo,
    ...(forma.nota === undefined ? {} : { nota: forma.nota }),
    serie: nomi.map((nome) => ({
      nome,
      punti: punti.map((p) => ({
        etichetta: etichettaMese(p.mese),
        valore: p.valori[nome] ?? '0',
      })),
    })),
  };

  const esito = await fuori({
    grafico_disegnato: forma.titolo,
    punti: punti.map((p) => ({ mese: p.mese.slice(0, 7), ...p.valori })),
    nota: "Il grafico è già mostrato all'utente. Commenta i valori, non descrivere la figura.",
  });

  return { ...esito, grafico };
}

/** `2026-07-01` → `lug 26`. Corto perché su un telefono ci stanno tre etichette. */
function etichettaMese(giorno: string): string {
  const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  const indice = Number(giorno.slice(5, 7)) - 1;
  return `${MESI[indice] ?? giorno.slice(5, 7)} ${giorno.slice(2, 4)}`;
}

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
      discrezionalita: CLASSE,
      contesto: { type: 'string', enum: [...CONTESTI] },
      note: { type: 'string', description: 'Perché fa eccezione.' },
    },
    required: ['id'],
  },
  esegui: async (a) => {
    const id = identificativo(a['id'], 'id');
    if (id === null) throw new ArgomentoNonValido("Serve l'identificativo del movimento.");

    const discrezionalita = await classeValida(a['discrezionalita']);
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

/**
 * Segna una spesa come una tantum.
 *
 * E' la scrittura che il caso `Booking.com` aspetta dalla Fase 5: quattro
 * prenotazioni in tre mesi che il rilevatore legge come abitudine, e nessun
 * criterio basato sul tempo puo' distinguere un viaggio da una consuetudine —
 * l'informazione non e' nei dati bancari, e' nella testa di chi ha comprato.
 *
 * **L'effetto lo calcola il server**, con `effetto_episodico`, e non e' una
 * cortesia: sono due cifre, e valgono le regole di sempre. Il modello che
 * scrivesse «passa da 266 a 41» le sbaglierebbe nel modo misurato in Fase 4 —
 * in modo credibile, e nessuno le ricontrolla. Qui vengono da una funzione SQL
 * che usa la stessa formula del cruscotto.
 */
const segnaEpisodica: Strumento = {
  nome: 'segna_episodica',
  descrizione:
    'Prepara di segnare UNA transazione come spesa una tantum: resta nella spesa del ' +
    'mese e nella cronologia, ma esce dal calcolo delle ricorrenze e dagli avvisi di ' +
    'picco. Usalo quando l’utente dice che una spesa era eccezionale — un viaggio, un ' +
    'acquisto singolo — e non un comportamento che si ripete. NON usarlo per correggere ' +
    'una classificazione sbagliata: per quella c’è correggi_movimento.',
  parametri: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Identificativo del movimento.' },
      episodico: {
        type: 'boolean',
        description: 'false per togliere il segno. Predefinito true.',
      },
    },
    required: ['id'],
  },
  esegui: async (a) => {
    const id = identificativo(a['id'], 'id');
    if (id === null) throw new ArgomentoNonValido("Serve l'identificativo del movimento.");
    const episodico = a['episodico'] === false ? false : true;

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc('effetto_episodico', { p_id: id });
    if (error !== null) throw new Error(error.message);

    const e = comeArray<Record<string, unknown>>(data)[0];
    if (e === undefined) throw new ArgomentoNonValido(`Nessun movimento con identificativo ${id}.`);

    if (e['gia_episodico'] === episodico) {
      throw new ArgomentoNonValido(
        episodico
          ? 'Questa spesa è già segnata come episodica.'
          : 'Questa spesa non è segnata come episodica.',
      );
    }

    const esercente = typeof e['esercente'] === 'string' ? e['esercente'] : 'esercente sconosciuto';
    const prima = e['costo_prima'];
    const dopo = e['costo_dopo'];

    // La frase sull'effetto la compone il server, dagli stessi valori che ha
    // letto. `costo_dopo` nullo non e' un errore: senza quella riga l'esercente
    // esce dalla metrica — meno di tre occorrenze, tre mesi o 75 giorni — e lo
    // si dice a parole invece di mostrare un trattino.
    const effetto =
      prima === null
        ? 'Questo esercente non è fra le ricorrenze, quindi nessun costo mensile cambia.'
        : dopo === null
          ? `Il costo ricorrente stimato (${String(prima)} €/mese) sparisce: senza questa ` +
            'spesa l’esercente non ha più abbastanza storia per entrare nella metrica.'
          : `Il costo ricorrente stimato passa da ${String(prima)} a ${String(dopo)} €/mese.`;

    return {
      dati: PREPARATA,
      proposta: {
        operazione: 'segna_episodica',
        argomenti: { id, episodico },
        descrizione: episodico
          ? `Segna come spesa episodica: ${esercente} · ${String(e['booking_date'])} · ` +
            `${String(e['amount_eur'])} €. Resta nella spesa del mese, ma non entrerà più ` +
            `nel calcolo delle spese ricorrenti. ${effetto}`
          : `Togli il segno di spesa episodica: ${esercente} · ${String(e['booking_date'])} · ` +
            `${String(e['amount_eur'])} €. Tornerà a contare fra le ricorrenze.`,
      },
    };
  },
};

/**
 * Gli obiettivi: leggerli e proporne uno.
 *
 * Sono **una tabella stretta**, non una memoria: quattro tipi, un bersaglio
 * strutturato, un valore, e una scadenza obbligatoria. Se una cosa che l'utente
 * dice non ci entra, non ci va infilata come nota — vuol dire che e' un'altra
 * natura di informazione, e va nel posto suo.
 */
const obiettiviStrumento: Strumento = {
  nome: 'obiettivi',
  descrizione:
    "Elenca gli obiettivi dell'utente, con quelli scaduti. Serve per capire cosa sta " +
    'cercando di ottenere prima di dare un consiglio. Un obiettivo SCADUTO non vale ' +
    'più: chiedi se vale ancora invece di darlo per buono.',
  parametri: { type: 'object', properties: {} },
  esegui: async () => fuori({ obiettivi: await leggiObiettivi() }),
};

const impostaObiettivo: Strumento = {
  nome: 'imposta_obiettivo',
  descrizione:
    "Prepara un obiettivo nuovo, oppure il rinnovo di uno scaduto. Usalo quando l'utente " +
    'dice cosa vuole ottenere («voglio tenere 5.000 € sul conto», «voglio spendere meno ' +
    'di 300 al mese in ristoranti»). NON usarlo per fatti su una spesa: quelli sono ' +
    'segna_episodica o correggi_movimento.',
  parametri: {
    type: 'object',
    properties: {
      tipo: {
        type: 'string',
        enum: [...TIPI_OBIETTIVO],
        description:
          'tetto_di_spesa (meno di X al mese in una categoria o classe) · ' +
          'liquidita_minima (tenere almeno X) · ridurre (spendere meno in qualcosa, ' +
          'senza una cifra) · risparmiare (mettere via X).',
      },
      valore: { type: 'number', description: 'In euro, positivo. Obbligatorio salvo «ridurre».' },
      categoria_id: STRINGA,
      classe: CLASSE,
      nota: { type: 'string', description: 'Perché, in poche parole.' },
      mesi: { type: 'integer', description: 'Per quanti mesi vale. Predefinito 6.' },
      rinnova_id: {
        type: 'string',
        description: 'Identificativo di un obiettivo scaduto da rinnovare, invece di crearne uno.',
      },
    },
    required: ['tipo'],
  },
  esegui: async (a) => {
    const rinnova = identificativo(a['rinnova_id'], 'rinnova_id');
    const mesi = intero(a['mesi'], 6, 60);

    if (rinnova !== null) {
      const esistenti = await leggiObiettivi();
      const o = esistenti.find((x) => x.id === rinnova);
      if (o === undefined) throw new ArgomentoNonValido('Questo obiettivo non esiste.');
      return {
        dati: PREPARATA,
        proposta: {
          operazione: 'imposta_obiettivo',
          argomenti: { rinnova_id: rinnova, mesi },
          descrizione: `Rinnova l’obiettivo «${descriviObiettivo(o)}» per altri ${mesi} mesi.`,
        },
      };
    }

    const tipo = fraQuesti(a['tipo'], TIPI_OBIETTIVO, 'tipo');
    if (tipo === null) throw new ArgomentoNonValido('Serve il tipo di obiettivo.');

    const categoriaId = identificativo(a['categoria_id'], 'categoria_id');
    const classe = await classeValida(a['classe']);
    const nota = testo(a['nota']);

    // L'importo non passa da un float nemmeno qui: arriva come numero JSON dal
    // modello e diventa subito una stringa decimale, che e' la forma in cui
    // Postgres lo vuole. Due decimali, perche' un obiettivo e' un importo.
    const grezzo = a['valore'];
    const valore =
      typeof grezzo === 'number' && Number.isFinite(grezzo) && grezzo > 0
        ? grezzo.toFixed(2)
        : null;

    // Il nome del bersaglio lo risolve il server: la descrizione che l'utente
    // legge non deve contenere un identificativo, e nemmeno un nome che il
    // modello si ricorda male.
    const bersaglio =
      categoriaId !== null
        ? ` in ${await nomeCategoria(categoriaId)}`
        : classe !== null
          ? ` in ${classe}`
          : '';

    const frase: Record<string, string> = {
      tetto_di_spesa: `Non più di ${valore ?? '—'} € al mese${bersaglio}`,
      liquidita_minima: `Tenere almeno ${valore ?? '—'} € sul conto`,
      ridurre: `Spendere meno${bersaglio}`,
      risparmiare: `Mettere da parte ${valore ?? '—'} €`,
    };

    return {
      dati: PREPARATA,
      proposta: {
        operazione: 'imposta_obiettivo',
        argomenti: { tipo, valore, categoria_id: categoriaId, classe, nota, mesi },
        descrizione:
          `Nuovo obiettivo: ${frase[tipo] ?? tipo}. Vale ${mesi} mesi, poi ti chiederò ` +
          `se è ancora valido.${nota === null ? '' : ` Nota: «${nota}».`}`,
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
      discrezionalita: CLASSE,
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
    const discrezionalita = await classeValida(a['discrezionalita']);
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
      discrezionalita_predefinita: CLASSE,
    },
    required: ['nome'],
  },
  esegui: async (a) => {
    const nome = testo(a['nome']);
    if (nome === null) throw new ArgomentoNonValido('Serve il nome della categoria.');

    const padreId = identificativo(a['padre_id'], 'padre_id');
    const predefinita = await classeValida(
      a['discrezionalita_predefinita'],
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

const spostaMovimentoStrumento: Strumento = {
  nome: 'sposta_movimento',
  descrizione:
    'Prepara lo spostamento di UNA transazione su un altro esercente. Serve quando ' +
    'sotto lo stesso nome convivono cose diverse che la banca scrive in modo ' +
    'identico — un canone e un acquisto singolo — e nessuna regola sulle etichette ' +
    'può separarli. La riga eredita la classificazione della destinazione e nessun ' +
    'automatismo la tocca più. Se la destinazione non esiste, passa nuovo_esercente.',
  parametri: {
    type: 'object',
    properties: {
      movimenti_id: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Uno o più movimenti, tutti verso la stessa destinazione. Passali INSIEME ' +
          'quando appartengono allo stesso gruppo: una conferma sola invece di cinque.',
      },
      esercente_id: { type: 'string', description: 'Destinazione, se esiste già.' },
      nuovo_esercente: {
        type: 'object',
        description: 'Da creare al volo, quando la destinazione non esiste ancora.',
        properties: {
          nome: STRINGA,
          categoria_id: STRINGA,
          discrezionalita: CLASSE,
          contesto: { type: 'string', enum: [...CONTESTI] },
          abbonamento: { type: 'boolean' },
        },
        required: ['nome'],
      },
    },
    required: ['movimenti_id'],
  },
  esegui: async (a) => {
    const grezziId = Array.isArray(a['movimenti_id']) ? a['movimenti_id'] : [a['movimenti_id']];
    const movimenti = grezziId
      .map((v, i) => identificativo(v, `movimenti_id[${i}]`))
      .filter((v): v is string => v !== null);

    if (movimenti.length === 0) {
      throw new ArgomentoNonValido("Serve almeno l'identificativo di un movimento.");
    }

    const esercenteId = identificativo(a['esercente_id'], 'esercente_id');
    const grezzo = a['nuovo_esercente'];
    const nuovo =
      grezzo !== null && typeof grezzo === 'object' && !Array.isArray(grezzo)
        ? (grezzo as Record<string, unknown>)
        : null;

    if (esercenteId === null && nuovo === null) {
      throw new ArgomentoNonValido(
        'Serve esercente_id, oppure nuovo_esercente con almeno un nome.',
      );
    }

    // Ogni riga si rilegge dal database: la descrizione che l'utente approva
    // dev'essere costruita sui movimenti veri, non su quello che il modello
    // crede di aver scelto.
    const supabase = await createSupabaseServerClient();
    const righe: Record<string, unknown>[] = [];
    for (const id of movimenti) {
      const { data } = await supabase.rpc('cerca_movimenti', {
        p_id: id,
        p_tipo: 'tutti',
        p_limite: 1,
      });
      const riga = comeArray<Record<string, unknown>>(data)[0];
      if (riga === undefined) {
        throw new ArgomentoNonValido(`Nessun movimento con identificativo ${id}.`);
      }
      righe.push(riga);
    }
    const riga = righe[0] as Record<string, unknown>;

    let destinazione: string;
    let argomenti: Record<string, unknown>;

    if (esercenteId !== null) {
      destinazione = await nomeEsercente(esercenteId);
      argomenti = { ids: movimenti, merchantId: esercenteId };
    } else {
      const nome = testo(nuovo?.['nome']);
      if (nome === null) throw new ArgomentoNonValido('Serve il nome del nuovo esercente.');
      const categoriaId = identificativo(nuovo?.['categoria_id'], 'categoria_id');
      destinazione = `${nome} (nuovo${categoriaId === null ? '' : `, in ${await nomeCategoria(categoriaId)}`})`;
      argomenti = {
        ids: movimenti,
        merchantId: null,
        nuovo: {
          nome,
          categoriaId,
          discrezionalita: await classeValida(nuovo?.['discrezionalita']),
          contesto: fraQuesti(nuovo?.['contesto'], CONTESTI, 'contesto'),
          abbonamento: nuovo?.['abbonamento'] === true,
        },
      };
    }

    return {
      dati: PREPARATA,
      proposta: {
        operazione: 'sposta_movimento',
        argomenti,
        descrizione:
          (righe.length === 1
            ? `Sposta il movimento del ${String(riga['booking_date'])} ` +
              `(${String(riga['amount_eur'] ?? riga['amount'])} €)`
            : `Sposta ${righe.length} movimenti — ` +
              righe
                .map(
                  (r) => `${String(r['booking_date'])} ${String(r['amount_eur'] ?? r['amount'])} €`,
                )
                .join(', ')) +
          ` da ${String(riga['esercente'] ?? 'nessun esercente')} a ${destinazione}. ` +
          `${righe.length === 1 ? 'La riga eredita' : 'Le righe ereditano'} la classificazione ` +
          'della destinazione, e da qui in poi nessun automatismo le tocca più.',
      },
    };
  },
};

/* -------------------------------------------------------------------------- */
/* Le classi di discrezionalita'                                               */
/* -------------------------------------------------------------------------- */
// Dalla `0043` le classi si creano, si rinominano e si eliminano. La regola
// della Fase 0 vale identica: se quelle operazioni vivessero solo dentro un
// bottone, per il copilota non esisterebbero — e la domanda «crea una classe
// per il risparmio» non avrebbe risposta.
//
// Come ogni scrittura, si **preparano** e l'utente le applica con un tocco.
// Qui il motivo e' anche piu' forte del solito: eliminare una classe riscrive
// la classificazione di ogni riga che la usava, comprese quelle corrette a
// mano, e non e' una cosa che debba succedere sull'interpretazione di una
// frase.

const creaClasseStrumento: Strumento = {
  nome: 'crea_classe',
  descrizione:
    'Prepara una classe di discrezionalità nuova. Prima controlla l’elenco nelle ' +
    'istruzioni: due classi che vogliono dire la stessa cosa spezzano la metrica ' +
    'principale in due righe che nessuno somma.',
  parametri: {
    type: 'object',
    properties: {
      nome: STRINGA,
      descrizione: {
        type: 'string',
        description: 'Cosa ci va dentro, in una riga. La leggerai tu la prossima volta.',
      },
      nel_ricorrente: {
        type: 'boolean',
        description:
          'Se il costo ricorrente di questa classe entra nel TOTALE. Falso per una spesa ' +
          'che si ripete ma che non si vuole togliere — risparmio, tasse, una rata: resta ' +
          'nella ripartizione, sotto la linea, ma non nel totale. Predefinito vero.',
      },
    },
    required: ['nome'],
  },
  esegui: async (a) => {
    const nome = testo(a['nome']);
    if (nome === null) throw new ArgomentoNonValido('Serve il nome della classe.');
    const descrizione = testo(a['descrizione']);
    const nelRicorrente = typeof a['nel_ricorrente'] === 'boolean' ? a['nel_ricorrente'] : true;

    return {
      dati: PREPARATA,
      proposta: {
        operazione: 'crea_classe',
        argomenti: { nome, descrizione, nel_ricorrente: nelRicorrente },
        descrizione:
          `Crea la classe «${nome}»` +
          (nelRicorrente
            ? ', dentro il totale del costo ricorrente.'
            : ', fuori dal totale del costo ricorrente: resterà nella ripartizione ma non nella somma.'),
      },
    };
  },
};

const aggiornaClasseStrumento: Strumento = {
  nome: 'aggiorna_classe',
  descrizione:
    'Prepara la correzione di una classe: nome, descrizione, se entra nel totale del ' +
    'costo ricorrente, o l’archiviazione. Rinominare non tocca nessuna spesa: lo slug ' +
    'resta lo stesso, cambia solo il nome mostrato.',
  parametri: {
    type: 'object',
    properties: {
      slug: { type: 'string', description: 'Lo slug della classe da correggere.' },
      nome: STRINGA,
      descrizione: STRINGA,
      nel_ricorrente: { type: 'boolean' },
      archiviata: {
        type: 'boolean',
        description:
          'Archiviare la toglie dai selettori e la lascia nello storico. Non cancella niente.',
      },
    },
    required: ['slug'],
  },
  esegui: async (a) => {
    const slug = await classeValida(a['slug'], 'slug');
    if (slug === null) throw new ArgomentoNonValido('Serve lo slug della classe.');

    const nome = testo(a['nome']);
    const descrizione = testo(a['descrizione']);
    const nelRicorrente = typeof a['nel_ricorrente'] === 'boolean' ? a['nel_ricorrente'] : null;
    const archiviata = typeof a['archiviata'] === 'boolean' ? a['archiviata'] : null;

    const cambi = [
      nome !== null ? `nome → ${nome}` : null,
      descrizione !== null ? 'descrizione aggiornata' : null,
      nelRicorrente !== null
        ? nelRicorrente
          ? 'entra nel totale del costo ricorrente'
          : 'esce dal totale del costo ricorrente'
        : null,
      archiviata !== null ? (archiviata ? 'archiviata' : 'riportata in uso') : null,
    ].filter((c): c is string => c !== null);

    if (cambi.length === 0) throw new ArgomentoNonValido('Non c’è niente da cambiare.');

    return {
      dati: PREPARATA,
      proposta: {
        operazione: 'aggiorna_classe',
        argomenti: {
          slug,
          nome,
          descrizione,
          nel_ricorrente: nelRicorrente,
          archiviata,
        },
        descrizione: `Classe «${slug}»: ${cambi.join(', ')}.`,
      },
    };
  },
};

const eliminaClasseStrumento: Strumento = {
  nome: 'elimina_classe',
  descrizione:
    'Prepara l’eliminazione di una classe, spostando le sue righe in un’altra. È anche ' +
    'il modo di UNIRE due classi. Se la classe non è in uso, «verso» si può omettere. ' +
    'Se vuoi solo smettere di usarla senza toccare lo storico, archiviala invece ' +
    'con aggiorna_classe.',
  parametri: {
    type: 'object',
    properties: {
      slug: { type: 'string', description: 'La classe da eliminare.' },
      verso: {
        type: 'string',
        description:
          'La classe in cui spostare movimenti, esercenti e categorie che usavano quella ' +
          'eliminata. Obbligatoria se è in uso.',
      },
    },
    required: ['slug'],
  },
  esegui: async (a) => {
    const slug = await classeValida(a['slug'], 'slug');
    if (slug === null) throw new ArgomentoNonValido('Serve lo slug della classe.');
    const verso = await classeValida(a['verso'], 'verso');
    if (verso === slug)
      throw new ArgomentoNonValido('La destinazione non può essere la stessa classe.');

    return {
      dati: PREPARATA,
      proposta: {
        operazione: 'elimina_classe',
        argomenti: { slug, verso },
        descrizione:
          `Elimina la classe «${slug}»` +
          (verso === null
            ? '. Se risulta ancora in uso l’operazione si ferma senza toccare niente.'
            : `, spostando tutte le sue righe in «${verso}». Tocca anche le righe corrette a mano: la classe che avevano non esisterà più.`),
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
  doveTagliare,
  graficoMensile,
  obiettiviStrumento,
  correggiMovimento,
  segnaEpisodica,
  impostaObiettivo,
  aggiornaEsercente,
  creaCategoria,
  spostaMovimentoStrumento,
  creaClasseStrumento,
  aggiornaClasseStrumento,
  eliminaClasseStrumento,
];

export function strumento(nome: string): Strumento | undefined {
  return STRUMENTI.find((s) => s.nome === nome);
}
