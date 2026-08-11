/**
 * Tipi delle risposte Enable Banking usate in Fase 1.
 *
 * Deliberatamente parziali: descrivono i campi che leggiamo, non l'intero
 * schema dell'API. I payload integrali verranno salvati cosi' come sono in
 * `raw_transactions` a partire dalla Fase 2, quindi non c'e' nessun bisogno di
 * modellare in anticipo campi che non usiamo.
 */

export type EbAspsp = {
  name: string;
  country: string;
  logo?: string;
  psu_types?: readonly string[];
  maximum_consent_validity?: number;
  beta?: boolean;
};

export type EbAspspsResponse = {
  aspsps: readonly EbAspsp[];
};

export type EbAuthResponse = {
  /** URL della banca a cui mandare l'utente per la SCA. */
  url: string;
  authorization_id?: string;
  psu_id_hash?: string;
};

export type EbAmount = {
  currency: string;
  /** Stringa decimale, mai un numero: la conversione avviene in ingestion. */
  amount: string;
};

export type EbAccountIdentification = {
  iban?: string;
  other?: { identification?: string; scheme_name?: string };
};

export type EbAccount = {
  uid: string;
  identification_hash?: string;
  account_id?: EbAccountIdentification;
  name?: string;
  product?: string;
  currency?: string;
  cash_account_type?: string;
  usage?: string;
  details?: string;
};

export type EbSession = {
  session_id: string;
  status?: string;
  accounts: readonly EbAccount[];
  aspsp?: { name: string; country: string };
  access?: { valid_until?: string };
  created?: string;
};

export type EbBalance = {
  name?: string;
  balance_amount: EbAmount;
  balance_type?: string;
  reference_date?: string;
};

export type EbBalancesResponse = {
  balances: readonly EbBalance[];
};

export type EbTransaction = {
  entry_reference?: string;
  transaction_amount: EbAmount;
  credit_debit_indicator?: 'CRDT' | 'DBIT';
  status?: string;
  booking_date?: string;
  value_date?: string;
  transaction_date?: string;
  remittance_information?: readonly string[];
  creditor?: { name?: string };
  debtor?: { name?: string };
};

export type EbTransactionsResponse = {
  transactions: readonly EbTransaction[];
  /** Presente finche' ci sono altre pagine da leggere. */
  continuation_key?: string;
};
