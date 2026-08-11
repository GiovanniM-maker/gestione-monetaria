import 'server-only';
import { getAccountDetails, getSession, maskIban } from '@/lib/enablebanking/client';
import { comeArray } from '@/lib/enablebanking/redact';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { AccountRow, AccountType, BankConnectionRow } from '@/lib/db/types';

/**
 * Registra in `bank_connections` e `accounts` cio' che la sessione Enable
 * Banking espone. E' il passo che deve precedere qualunque ingestion: le righe
 * di `raw_transactions` referenziano `accounts.id`, non l'uid dell'API.
 *
 * Rieseguibile quante volte si vuole, e va rilanciato dopo ogni
 * riautorizzazione, perche' cambiano `eb_session_id` e scadenza del consenso.
 */

/** `cash_account_type` ISO 20022 → la nostra classificazione. */
export function classificaConto(cashAccountType: unknown): AccountType | null {
  switch (typeof cashAccountType === 'string' ? cashAccountType.toUpperCase() : '') {
    case 'CACC':
      return 'current';
    case 'CARD':
      return 'card';
    case 'SVGS':
      return 'savings';
    case 'OTHR':
    case 'CASH':
      return 'pocket';
    default:
      return null;
  }
}

/**
 * Pocket e conti di risparmio restano fuori dai totali di spesa: spostarci
 * dentro dei soldi non e' spendere, e contarlo gonfierebbe ogni aggregato.
 *
 * E' solo il valore **iniziale**. Una volta scritto non viene piu' toccato dalle
 * sincronizzazioni successive: se lo correggi a mano, la correzione resta.
 */
export function includiNeiTotali(tipo: AccountType | null): boolean {
  return tipo !== 'savings' && tipo !== 'pocket';
}

export type RegistrazioneSessione = {
  connection: BankConnectionRow;
  accounts: readonly AccountRow[];
};

export async function registerSessionAccounts(ebSessionId: string): Promise<RegistrazioneSessione> {
  const sessione = await getSession(ebSessionId);
  const supabase = await createSupabaseServerClient();

  const aspspName = sessione.aspsp?.name;
  const aspspCountry = sessione.aspsp?.country;
  if (typeof aspspName !== 'string' || typeof aspspCountry !== 'string') {
    throw new Error('La sessione non dichiara quale istituto rappresenta.');
  }

  const { data: connection, error: erroreConnessione } = await supabase
    .from('bank_connections')
    .upsert(
      {
        aspsp_name: aspspName,
        aspsp_country: aspspCountry,
        eb_session_id: sessione.session_id,
        status: 'active',
        authorized_at: new Date().toISOString(),
        valid_until: sessione.access?.valid_until ?? null,
      },
      { onConflict: 'aspsp_name,aspsp_country' },
    )
    .select()
    .single<BankConnectionRow>();

  if (erroreConnessione !== null || connection === null) {
    throw new Error(
      `Salvataggio connessione fallito: ${erroreConnessione?.message ?? 'nessuna riga restituita'}`,
    );
  }

  // Gli uid stanno in `accounts` come stringhe, ma accettiamo anche la forma a
  // oggetti e `accounts_data`: su questa API le due chiamate di sessione hanno
  // gia' risposto in modi diversi una volta.
  const uids = [
    ...comeArray<unknown>(sessione.accounts).map((voce) =>
      typeof voce === 'string' ? voce : (voce as { uid?: unknown })?.uid,
    ),
    ...comeArray<{ uid?: unknown }>(sessione.accounts_data).map((voce) => voce?.uid),
  ].filter((uid): uid is string => typeof uid === 'string' && uid !== '');

  const accounts: AccountRow[] = [];

  for (const uid of [...new Set(uids)]) {
    const dettagli = await getAccountDetails(uid);
    const iban = dettagli.account_id?.iban;
    const tipo = classificaConto(dettagli.cash_account_type);

    const campiDescrittivi = {
      connection_id: connection.id,
      iban_masked: typeof iban === 'string' ? maskIban(iban) : null,
      name: dettagli.name ?? dettagli.product ?? null,
      currency: dettagli.currency ?? 'EUR',
      account_type: tipo,
      is_active: true,
    };

    const { data: esistente } = await supabase
      .from('accounts')
      .select('id')
      .eq('eb_account_uid', uid)
      .maybeSingle<{ id: string }>();

    // Su un conto gia' noto si aggiornano solo i campi descrittivi.
    // `include_in_totals` viene scritto una volta sola, alla creazione: e' una
    // scelta che l'utente puo' correggere, e una sincronizzazione non deve
    // sovrascrivere una correzione manuale.
    const query =
      esistente === null || esistente === undefined
        ? supabase
            .from('accounts')
            .insert({
              ...campiDescrittivi,
              eb_account_uid: uid,
              include_in_totals: includiNeiTotali(tipo),
            })
            .select()
        : supabase.from('accounts').update(campiDescrittivi).eq('id', esistente.id).select();

    const { data, error } = await query.single<AccountRow>();

    if (error !== null || data === null) {
      throw new Error(`Salvataggio conto ${uid} fallito: ${error?.message ?? 'nessuna riga'}`);
    }

    accounts.push(data);
  }

  return { connection, accounts };
}
