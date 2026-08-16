import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { applicaTassonomia } from './applica';
import type { Context, Discretion, MatchType, MerchantRow } from '@/lib/db/types';

/**
 * Assegnare un'etichetta a un esercente, dalla schermata di revisione.
 *
 * La scelta di fondo: **si crea un alias, non si marca una transazione.**
 *
 * Marcare le righe una per una avrebbe funzionato oggi e sarebbe stato inutile
 * domani — la stessa etichetta ricomparira' al prossimo sync e tornerebbe da
 * classificare. L'alias invece e' una dichiarazione sul mondo: "questo testo e'
 * quell'esercente", vera per le occorrenze passate e per quelle future. E' lo
 * stesso ragionamento di `own_counterparties`, dove l'utente dichiara una volta
 * quali controparti sono conti propri.
 *
 * Conseguenza voluta: `manually_categorized` NON viene toccato qui. Quel flag
 * serve a un'altra cosa — la singola transazione che fa eccezione rispetto al
 * suo esercente — e usarlo anche qui lo renderebbe un tappo indistinguibile
 * dalla classificazione ordinaria.
 */

export const DISCREZIONALITA: readonly Discretion[] = [
  'essenziale',
  'investimento',
  'utile',
  'voluttuario',
];
export const CONTESTI: readonly Context[] = ['personale', 'business'];

export type NuovoMerchant = {
  canonical_name: string;
  category_id: string | null;
  discretion: Discretion | null;
  context: Context | null;
  is_subscription: boolean;
};

export type RichiestaAssegnazione = {
  etichetta: string;
  /** Esercente esistente, oppure i dati per crearne uno. Uno dei due. */
  merchantId?: string;
  nuovo?: NuovoMerchant;
  /**
   * `exact` di default: il pattern e' l'etichetta intera, quindi non puo'
   * pescare niente che l'utente non abbia visto. `contains` si chiede
   * esplicitamente, quando si sa che quel testo e' un frammento ricorrente.
   */
  matchType?: MatchType;
};

export class AssegnazioneNonValida extends Error {}

export async function assegnaEtichetta(richiesta: RichiestaAssegnazione) {
  const etichetta = richiesta.etichetta.trim();
  if (etichetta === '') throw new AssegnazioneNonValida('Etichetta vuota.');

  const matchType: MatchType = richiesta.matchType ?? 'exact';
  if (!['exact', 'contains', 'regex'].includes(matchType)) {
    throw new AssegnazioneNonValida(`Tipo di confronto sconosciuto: ${matchType}`);
  }

  const supabase = await createSupabaseServerClient();

  let merchantId = richiesta.merchantId ?? null;

  if (merchantId === null) {
    const nuovo = richiesta.nuovo;
    if (nuovo === undefined || nuovo.canonical_name.trim() === '') {
      throw new AssegnazioneNonValida('Serve un esercente esistente o il nome di uno nuovo.');
    }
    validaClassificazione(nuovo.discretion, nuovo.context);

    // `upsert` e non `insert`: se l'esercente esiste gia' con lo stesso nome
    // canonico, va riusato. Crearne un secondo che differisce per maiuscole e'
    // esattamente cio' che il vincolo su `canonical_norm` esiste per impedire,
    // e qui produrrebbe un errore incomprensibile invece di un riuso.
    const { data, error } = await supabase
      .from('merchants')
      .upsert(
        {
          canonical_name: nuovo.canonical_name.trim(),
          category_id: nuovo.category_id,
          discretion: nuovo.discretion,
          context: nuovo.context,
          is_subscription: nuovo.is_subscription,
        },
        { onConflict: 'canonical_norm' },
      )
      .select()
      .single<MerchantRow>();

    if (error !== null || data === null) {
      throw new Error(`Creazione esercente fallita: ${error?.message ?? 'nessuna riga'}`);
    }
    merchantId = data.id;
  }

  const { error: erroreAlias } = await supabase
    .from('merchant_aliases')
    .upsert(
      { merchant_id: merchantId, pattern: etichetta, match_type: matchType, priority: 0 },
      { onConflict: 'pattern,match_type' },
    );

  if (erroreAlias !== null) {
    throw new Error(`Creazione alias fallita: ${erroreAlias.message}`);
  }

  // Si rilancia l'intera categorizzazione invece di aggiornare le sole righe
  // che corrispondono a questa etichetta. Costa qualche secondo e vale il
  // prezzo: un secondo percorso di abbinamento, scritto qui e leggermente
  // diverso da quello vero, e' il modo classico per far divergere i due.
  return applicaTassonomia();
}

/**
 * Un aggiornamento **parziale**, e i campi sono opzionali di proposito.
 *
 * Un campo **assente** vuol dire «non toccarlo»; un campo a `null` vuol dire
 * «svuotalo». Sono due cose diverse, e confonderle e' costato un difetto vero:
 * il selettore di categoria dentro le righe manda solo `{ id, category_id }` —
 * e' l'unica cosa che cambia — e la validazione, che ammetteva `null` ma non
 * l'assenza, rispondeva
 * «Discrezionalita' non ammessa: undefined» a ogni cambio di categoria fatto
 * dall'elenco degli esercenti. La scrittura non arrivava mai al database.
 */
export type AggiornamentoMerchant = {
  id: string;
  category_id?: string | null;
  discretion?: Discretion | null;
  context?: Context | null;
  is_subscription?: boolean;
};

export async function aggiornaMerchant(aggiornamento: AggiornamentoMerchant) {
  if (typeof aggiornamento.id !== 'string' || aggiornamento.id.trim() === '') {
    throw new AssegnazioneNonValida('Esercente non indicato.');
  }
  validaClassificazione(aggiornamento.discretion, aggiornamento.context);

  // Si scrivono **solo** i campi arrivati. Mandarli tutti significherebbe
  // azzerare quelli che il chiamante non ha nominato: cambiare la categoria da
  // una riga d'elenco cancellerebbe discrezionalita' e contesto dell'esercente.
  const campi: Record<string, unknown> = {};
  if ('category_id' in aggiornamento) campi['category_id'] = aggiornamento.category_id;
  if ('discretion' in aggiornamento) campi['discretion'] = aggiornamento.discretion;
  if ('context' in aggiornamento) campi['context'] = aggiornamento.context;
  if ('is_subscription' in aggiornamento) campi['is_subscription'] = aggiornamento.is_subscription;

  if (Object.keys(campi).length === 0) {
    throw new AssegnazioneNonValida('Non c\u2019e\u2019 niente da cambiare.');
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('merchants').update(campi).eq('id', aggiornamento.id);

  if (error !== null) throw new Error(`Aggiornamento esercente fallito: ${error.message}`);

  // La discrezionalita' vive sull'esercente ma va riscritta su ogni sua
  // transazione, o gli aggregati continuerebbero a usare quella vecchia.
  return applicaTassonomia();
}

/**
 * Il database ha gia' i `check`, ma un errore di vincolo arriva all'utente come
 * un messaggio di Postgres. Qui si sbaglia prima e si dice cosa era ammesso.
 *
 * Esportata solo per poterla provare: e' pura, e la distinzione fra `null` e
 * `undefined` che difende e' esattamente il difetto che si vuole non far
 * tornare.
 */
export function validaPerLaProva(v: { discretion: unknown; context: unknown }): void {
  validaClassificazione(v.discretion, v.context);
}

function validaClassificazione(discretion: unknown, context: unknown): void {
  // `undefined` significa «campo non mandato», e non e' un valore da validare:
  // e' l'assenza. `null` invece e' una scelta — «togli la discrezionalita'» — e
  // resta ammesso.
  if (
    discretion !== null &&
    discretion !== undefined &&
    !DISCREZIONALITA.includes(discretion as Discretion)
  ) {
    throw new AssegnazioneNonValida(
      `Discrezionalita' non ammessa: ${String(discretion)}. Valori validi: ${DISCREZIONALITA.join(', ')}.`,
    );
  }
  if (context !== null && context !== undefined && !CONTESTI.includes(context as Context)) {
    throw new AssegnazioneNonValida(
      `Contesto non ammesso: ${String(context)}. Valori validi: ${CONTESTI.join(', ')}.`,
    );
  }
}
