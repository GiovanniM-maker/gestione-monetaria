import 'server-only';
import { getAccountDetails, getSession, maskIban } from '@/lib/enablebanking/client';
import { comeArray } from '@/lib/enablebanking/redact';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { EbAccount } from '@/lib/enablebanking/types';
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

export type PassoRegistrazione = {
  uid: string;
  dettagli: EbAccount;
  /** Il conto gia' presente che questo uid rappresenta, se ce n'e' uno. */
  esistente: AccountRow | null;
};

export class UidRuotati extends Error {}

/**
 * Decide quale conto della sessione corrisponde a quale conto gia' salvato.
 *
 * Perche' non basta l'uid, che sarebbe la cosa ovvia: **l'`eb_account_uid` non
 * e' stabile fra una autorizzazione e l'altra**. Verificato l'11 agosto 2026:
 * dopo una riautorizzazione i tre conti Revolut sono tornati con uid tutti
 * nuovi. Cercandoli solo per uid non se ne trova nessuno, se ne creano tre
 * paralleli, e lo storico si spacca in due meta'.
 *
 * Il danno vero non e' la riga in piu'. Il riconoscimento strutturale dei
 * giroconti marca come giroconto ogni `entry_reference` presente su due conti
 * diversi: con il conto sdoppiato, tutto il periodo scaricato due volte diventa
 * giroconto. Le spese reali spariscono dalle analisi **senza un errore**, ed e'
 * la peggiore categoria di guasto che questa applicazione possa avere.
 *
 * Quindi due difese:
 *
 * 1. **Si abbina anche per IBAN.** Un conto ritrovato per IBAN si aggiorna, uid
 *    compreso: e' lo stesso conto, con un nome nuovo.
 * 2. **Se restano conti noti spaiati mentre arrivano uid mai visti, ci si
 *    ferma.** E' la firma esatta della rotazione degli uid sui conti senza IBAN
 *    — i pocket Revolut ce l'hanno nullo, quindi la difesa 1 non li copre.
 *    Fermarsi costa un intervento manuale; proseguire costa numeri sbagliati
 *    che nessuno vede.
 */
export function abbinaConti(
  esistenti: readonly AccountRow[],
  dettagliPerUid: ReadonlyMap<string, EbAccount>,
): readonly PassoRegistrazione[] {
  const perUid = new Map(esistenti.map((a) => [a.eb_account_uid, a]));
  const spaiati = new Set(esistenti.map((a) => a.id));
  const piano: PassoRegistrazione[] = [];

  for (const [uid, dettagli] of dettagliPerUid) {
    let esistente = perUid.get(uid) ?? null;

    if (esistente === null) {
      const iban = dettagli.account_id?.iban;
      const mascherato = typeof iban === 'string' ? maskIban(iban) : null;
      if (mascherato !== null) {
        // Solo se l'IBAN individua un conto e uno solo: due conti con le stesse
        // ultime quattro cifre non sono un abbinamento, sono un'ambiguita'.
        const candidati = esistenti.filter(
          (a) => a.iban_masked === mascherato && spaiati.has(a.id),
        );
        if (candidati.length === 1) esistente = candidati[0] ?? null;
      }
    }

    if (esistente !== null) spaiati.delete(esistente.id);
    piano.push({ uid, dettagli, esistente });
  }

  const nuovi = piano.filter((p) => p.esistente === null);

  if (spaiati.size > 0 && nuovi.length > 0) {
    throw new UidRuotati(
      `La sessione espone ${nuovi.length} conti mai visti mentre ${spaiati.size} conti gia' ` +
        `registrati restano spaiati. Quasi certamente la banca ha cambiato gli identificativi ` +
        `dei conti: registrarli creerebbe conti duplicati e lo storico si spaccherebbe in due, ` +
        `facendo passare per giroconti meta' delle spese reali. Non registro niente. ` +
        `Vanno unificati a mano prima di proseguire.`,
    );
  }

  return piano;
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

  // I conti gia' noti su questa connessione. Servono prima di scrivere
  // qualsiasi cosa: l'abbinamento va deciso guardando l'insieme, non un conto
  // per volta (vedi `abbinaConti`).
  const { data: esistentiGrezzi } = await supabase
    .from('accounts')
    .select('*')
    .eq('connection_id', connection.id);
  const esistenti = comeArray<AccountRow>(esistentiGrezzi);

  const dettagliPerUid = new Map<string, EbAccount>();
  for (const uid of [...new Set(uids)]) {
    dettagliPerUid.set(uid, await getAccountDetails(uid));
  }

  const piano = abbinaConti(esistenti, dettagliPerUid);

  const accounts: AccountRow[] = [];

  for (const passo of piano) {
    const dettagli = passo.dettagli;
    const iban = dettagli.account_id?.iban;
    const tipo = classificaConto(dettagli.cash_account_type);

    const campiDescrittivi = {
      connection_id: connection.id,
      // L'uid si riscrive anche sui conti gia' noti: se la banca lo ha
      // cambiato, il conto e' lo stesso e il nuovo uid e' quello con cui
      // andranno chieste le prossime pagine.
      eb_account_uid: passo.uid,
      iban_masked: typeof iban === 'string' ? maskIban(iban) : null,
      // `product` prima di `name`: nella risposta Enable Banking `name` e'
      // l'intestatario del conto, quindi su un'utenza mono-persona sarebbe lo
      // stesso identico valore su tutte le righe e non distinguerebbe niente.
      name: dettagli.product ?? dettagli.name ?? null,
      currency: dettagli.currency ?? 'EUR',
      account_type: tipo,
      is_active: true,
    };

    // Su un conto gia' noto si aggiornano solo i campi descrittivi.
    // `include_in_totals` viene scritto una volta sola, alla creazione: e' una
    // scelta che l'utente puo' correggere, e una sincronizzazione non deve
    // sovrascrivere una correzione manuale.
    const query =
      passo.esistente === null
        ? supabase
            .from('accounts')
            .insert({ ...campiDescrittivi, include_in_totals: includiNeiTotali(tipo) })
            .select()
        : supabase.from('accounts').update(campiDescrittivi).eq('id', passo.esistente.id).select();

    const { data, error } = await query.single<AccountRow>();

    if (error !== null || data === null) {
      throw new Error(
        `Salvataggio conto ${passo.uid} fallito: ${error?.message ?? 'nessuna riga'}`,
      );
    }

    accounts.push(data);
  }

  return { connection, accounts };
}
