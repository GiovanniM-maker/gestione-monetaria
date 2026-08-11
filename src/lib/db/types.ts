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
