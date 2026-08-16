/**
 * Tipi delle righe delle tabelle applicative.
 *
 * Scritti a mano invece che generati: la generazione richiede una connessione
 * al progetto remoto, e in cambio di quella dipendenza darebbe tipi che
 * conosciamo gia', visto che lo schema lo definiamo noi nelle migration.
 *
 * Le colonne `numeric` e `timestamptz` arrivano da PostgREST come stringhe, e
 * qui restano stringhe: la conversione in interi di centesimi avviene dove
 * serve, mai implicitamente.
 */

export type ConnectionStatus = 'active' | 'expiring' | 'expired' | 'revoked' | 'error';
export type SyncTrigger = 'cron' | 'manual' | 'backfill';
export type SyncStatus = 'running' | 'success' | 'partial' | 'failed';
export type AccountType = 'current' | 'savings' | 'pocket' | 'card';
export type RawSource = 'enablebanking' | 'csv' | 'manual';

export type BankConnectionRow = {
  id: string;
  aspsp_name: string;
  aspsp_country: string;
  eb_session_id: string | null;
  status: ConnectionStatus;
  authorized_at: string | null;
  valid_until: string | null;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AccountRow = {
  id: string;
  connection_id: string;
  eb_account_uid: string;
  iban_masked: string | null;
  name: string | null;
  currency: string;
  account_type: AccountType | null;
  is_active: boolean;
  include_in_totals: boolean;
  created_at: string;
};

export type SyncRunRow = {
  id: string;
  connection_id: string | null;
  trigger: SyncTrigger;
  started_at: string;
  finished_at: string | null;
  status: SyncStatus;
  accounts_synced: number;
  rows_fetched: number;
  rows_new: number;
  rows_duplicate: number;
  cursor: BackfillCursor | null;
  error_message: string | null;
};

/**
 * Stato di avanzamento del backfill, salvato in `sync_runs.cursor` a ogni
 * pagina. E' cio' che rende la ripresa possibile: contiene tutto il necessario
 * per riprendere esattamente da dove ci si era fermati, senza rileggere nulla
 * e senza saltare nulla.
 */
export type BackfillCursor = {
  /** Estremi richiesti all'API, in formato `YYYY-MM-DD`. `null` = nessun limite. */
  dateFrom: string | null;
  dateTo: string | null;
  /** Conti ancora da iniziare, per uid Enable Banking. */
  pending: readonly string[];
  /** Conto in lavorazione, oppure `null` se il prossimo va ancora estratto da `pending`. */
  current: string | null;
  /** Chiave di continuazione dell'ultima pagina completata del conto corrente. */
  continuationKey: string | null;
  /** Conti gia' completati, per contabilita' e per il resoconto finale. */
  completed: readonly string[];
};

/**
 * Lo slug di una classe di discrezionalita'.
 *
 * Era un'unione delle quattro parole. Non lo e' piu' dalla `0043`: le classi si
 * creano e si rinominano, quindi l'insieme dei valori validi non e' noto a chi
 * compila — e' una riga di `discretion_classes`, e la sola cosa che possa
 * dichiararlo e' il database.
 *
 * Resta un tipo suo e non `string` nudo perche' dice **cosa contiene** la
 * variabile: `Discretion` in una firma significa «lo slug di una classe», e
 * `string` non significa niente. Il controllo, che l'unione faceva a
 * compilazione, si e' spostato dove ora vive la verita': la foreign key sulle
 * tre colonne, e `valida_classe` per il messaggio.
 */
export type Discretion = string;
export type Context = 'personale' | 'business';
export type MatchType = 'exact' | 'contains' | 'regex';

/**
 * Le tinte fra cui una classe puo' scegliere.
 *
 * Chiusa, e non un colore libero. Le tinte vere stanno in `globals.css` in un
 * posto solo, con le due varianti chiaro e scuro: un hex scelto a mano non ha
 * una variante per il tema scuro, e due rosa indistinguibili renderebbero il
 * colore un'informazione in meno — che e' gia' la ragione per cui l'accento e'
 * stato tolto alle classi.
 *
 * Sette e non di piu', come la tavolozza della ciambella: oltre la settima due
 * tinte adiacenti si somigliano e la barra smette di dire a colpo d'occhio
 * quale classe si sta guardando.
 */
export const COLORI_CLASSE = ['blu', 'ambra', 'rosa', 'verde', 'viola', 'ciano', 'bruno'] as const;
export type ColoreClasse = (typeof COLORI_CLASSE)[number];

export type DiscretionClassRow = {
  slug: string;
  nome: string;
  descrizione: string | null;
  colore: string;
  sort_order: number;
  /**
   * Se la classe entra nel **totale** del costo ricorrente. Le altre restano
   * nella ripartizione, sotto la linea, con il loro subtotale: mai nascoste.
   */
  nel_ricorrente: boolean;
  is_archived: boolean;
};

export type CategoryRow = {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  icon: string | null;
  color: string | null;
  default_discretion: Discretion | null;
  is_archived: boolean;
  sort_order: number;
  created_at: string;
};

export type MerchantRow = {
  id: string;
  canonical_name: string;
  category_id: string | null;
  discretion: Discretion | null;
  context: Context | null;
  is_subscription: boolean;
  website: string | null;
  cancel_url: string | null;
  notes: string | null;
  created_at: string;
};

export type MerchantAliasRow = {
  id: string;
  merchant_id: string;
  pattern: string;
  match_type: MatchType;
  priority: number;
  created_at: string;
};
