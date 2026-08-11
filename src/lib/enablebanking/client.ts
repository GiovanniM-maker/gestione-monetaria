import 'server-only';
import { EB_BASE_URL } from './config';
import { createEbJwt } from './jwt';
import type {
  EbAccount,
  EbAspsp,
  EbAspspsResponse,
  EbAuthResponse,
  EbBalancesResponse,
  EbSession,
  EbTransactionsResponse,
} from './types';

/**
 * Client Enable Banking. Server-only: ogni chiamata firma un JWT con la chiave
 * privata, che non deve mai lasciare il server.
 */

export class EbApiError extends Error {
  readonly status: number;
  /** Corpo della risposta, troncato. Utile in debug, mai mostrato in chiaro in UI. */
  readonly body: string;

  constructor(method: string, path: string, status: number, body: string) {
    super(`Enable Banking ${method} ${path} ha risposto ${status}`);
    this.name = 'EbApiError';
    this.status = status;
    this.body = body;
  }
}

async function request<T>(
  method: 'GET' | 'POST',
  path: string,
  options: { body?: unknown; query?: Record<string, string | undefined> } = {},
): Promise<T> {
  const url = new URL(path, EB_BASE_URL);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${createEbJwt()}`,
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    // I dati bancari non si mettono in cache: ogni chiamata deve essere fresca.
    cache: 'no-store',
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new EbApiError(method, path, response.status, body.slice(0, 2000));
  }

  return (await response.json()) as T;
}

/** Connettori disponibili, opzionalmente filtrati per paese ISO 3166 a due lettere. */
export async function listAspsps(country?: string): Promise<readonly EbAspsp[]> {
  const data = await request<EbAspspsResponse>('GET', '/aspsps', { query: { country } });
  return data.aspsps;
}

export type StartAuthorizationInput = {
  aspspName: string;
  aspspCountry: string;
  redirectUrl: string;
  /** Valore casuale, confrontato al ritorno per verificare che la risposta sia nostra. */
  state: string;
  validUntil: Date;
  psuType?: 'personal' | 'business';
};

/** Avvia l'autorizzazione: restituisce l'URL della banca a cui mandare l'utente. */
export async function startAuthorization(input: StartAuthorizationInput): Promise<EbAuthResponse> {
  return request<EbAuthResponse>('POST', '/auth', {
    body: {
      access: { valid_until: input.validUntil.toISOString() },
      aspsp: { name: input.aspspName, country: input.aspspCountry },
      state: input.state,
      redirect_url: input.redirectUrl,
      psu_type: input.psuType ?? 'personal',
    },
  });
}

/** Scambia il codice di autorizzazione per una sessione con l'elenco dei conti. */
export async function createSession(code: string): Promise<EbSession> {
  return request<EbSession>('POST', '/sessions', { body: { code } });
}

export async function getSession(sessionId: string): Promise<EbSession> {
  return request<EbSession>('GET', `/sessions/${encodeURIComponent(sessionId)}`);
}

export async function getBalances(accountUid: string): Promise<EbBalancesResponse> {
  return request<EbBalancesResponse>('GET', `/accounts/${encodeURIComponent(accountUid)}/balances`);
}

/**
 * Una singola pagina di transazioni. La paginazione via `continuation_key` non
 * viene percorsa qui: il ciclo completo, riavviabile, e' lavoro della Fase 2.
 */
export async function getTransactionsPage(
  accountUid: string,
  options: { dateFrom?: string; dateTo?: string; continuationKey?: string } = {},
): Promise<EbTransactionsResponse> {
  return request<EbTransactionsResponse>(
    'GET',
    `/accounts/${encodeURIComponent(accountUid)}/transactions`,
    {
      query: {
        date_from: options.dateFrom,
        date_to: options.dateTo,
        continuation_key: options.continuationKey,
      },
    },
  );
}

/** Etichetta leggibile di un conto, con IBAN sempre mascherato. */
export function describeAccount(account: EbAccount): string {
  const iban = account.account_id?.iban;
  const other = account.account_id?.other?.identification;
  const identifier = iban !== undefined ? maskIban(iban) : maskOther(other);
  const label = account.name ?? account.product ?? 'Conto';
  return `${label} · ${identifier} · ${account.currency ?? '—'}`;
}

/** Regola 7 di CLAUDE.md: in UI gli IBAN si mostrano solo mascherati. */
export function maskIban(iban: string): string {
  const compact = iban.replace(/\s+/g, '');
  return compact.length <= 4 ? '****' : `****${compact.slice(-4)}`;
}

function maskOther(identification: string | undefined): string {
  if (identification === undefined || identification === '') return '—';
  return identification.length <= 4 ? '****' : `****${identification.slice(-4)}`;
}
