import { cookies } from 'next/headers';
import type { Metadata } from 'next';
import {
  describeAccount,
  getBalances,
  getSession,
  getTransactionsPage,
  listAspsps,
} from '@/lib/enablebanking/client';
import { ebConfigStatus } from '@/lib/enablebanking/config';
import type { EbAccount } from '@/lib/enablebanking/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Debug Enable Banking' };

/**
 * Pagina di verifica della Fase 1. Mostra dati grezzi, non e' una schermata di
 * prodotto: serve solo a rispondere alla domanda "il collegamento funziona?".
 *
 * Sta dentro il route group `(app)`, quindi il layout chiama gia' `requireUser()`
 * e la pagina non e' raggiungibile da disconnessi. Senza quella protezione
 * esporrebbe i saldi.
 */

const REVOLUT_COUNTRY = 'LT';

type Esito<T> = { ok: true; valore: T } | { ok: false; errore: string };

/**
 * Isola la chiamata di rete dal rendering. Serve anche a rispettare
 * `react-hooks/error-boundaries`: il JSX non va costruito dentro un try/catch,
 * perche' un errore sollevato a meta' albero lascerebbe l'interfaccia in uno
 * stato che React non sa recuperare.
 */
async function prova<T>(chiamata: () => Promise<T>): Promise<Esito<T>> {
  try {
    return { ok: true, valore: await chiamata() };
  } catch (errore) {
    return { ok: false, errore: errore instanceof Error ? errore.message : String(errore) };
  }
}

function Riquadro({ titolo, children }: { titolo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 className="mb-3 text-sm font-semibold tracking-tight">{titolo}</h2>
      {children}
    </section>
  );
}

function Errore({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
      {children}
    </p>
  );
}

function Configurazione() {
  const stato = ebConfigStatus();

  const righe = [
    {
      nome: 'EB_APPLICATION_ID',
      ok: stato.applicationId === 'ok',
      dettaglio: stato.applicationId === 'ok' ? 'impostata' : 'non impostata su questo ambiente',
    },
    {
      nome: 'EB_PRIVATE_KEY_BASE64',
      ok: stato.privateKey === 'ok',
      dettaglio:
        stato.privateKey === 'ok'
          ? `chiave PEM valida, ${stato.privateKeyLength} caratteri una volta decodificata`
          : stato.privateKey === 'mancante'
            ? 'non impostata su questo ambiente'
            : 'impostata, ma decodificandola non risulta una chiave PEM: probabilmente e’ stato incollato un valore diverso, oppure il base64 e’ andato a capo e ne e’ finita solo la prima riga',
    },
  ];

  return (
    <ul className="space-y-1 text-sm">
      {righe.map((riga) => (
        <li key={riga.nome} className="flex gap-2">
          <span aria-hidden>{riga.ok ? '✅' : '❌'}</span>
          <span>
            <span className="font-mono text-xs">{riga.nome}</span>{' '}
            <span className="text-neutral-500">· {riga.dettaglio}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

async function Connettori() {
  const esito = await prova(() => listAspsps(REVOLUT_COUNTRY));
  if (!esito.ok) return <Errore>Lettura connettori fallita: {esito.errore}</Errore>;

  const revolut = esito.valore.filter((a) => a.name.toLowerCase().includes('revolut'));

  if (revolut.length === 0) {
    return (
      <Errore>
        Nessun connettore Revolut sotto {REVOLUT_COUNTRY}. Connettori totali per quel paese:{' '}
        {esito.valore.length}.
      </Errore>
    );
  }

  return (
    <ul className="space-y-2">
      {revolut.map((aspsp) => (
        <li
          key={`${aspsp.name}-${aspsp.country}`}
          className="flex items-center justify-between gap-4 text-sm"
        >
          <span>
            {aspsp.name} <span className="text-neutral-500">({aspsp.country})</span>
            {aspsp.maximum_consent_validity !== undefined && (
              <span className="text-neutral-500">
                {' '}
                · consenso max {Math.round(aspsp.maximum_consent_validity / 86400)} giorni
              </span>
            )}
            {aspsp.beta === true && <span className="text-amber-600"> · beta</span>}
          </span>
          <form action="/api/eb/authorize" method="post">
            <input type="hidden" name="aspsp_name" value={aspsp.name} />
            <input type="hidden" name="aspsp_country" value={aspsp.country} />
            <button
              type="submit"
              className="rounded-md bg-neutral-900 px-3 py-1 text-xs font-medium text-white dark:bg-white dark:text-neutral-900"
            >
              Autorizza
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}

async function Saldi({ accountUid }: { accountUid: string }) {
  const esito = await prova(() => getBalances(accountUid));
  if (!esito.ok) return <Errore>Saldi non disponibili: {esito.errore}</Errore>;

  const { balances } = esito.valore;
  if (balances.length === 0) return <p className="text-xs text-neutral-500">Nessun saldo.</p>;

  return (
    <ul className="text-sm">
      {balances.map((saldo, indice) => (
        <li key={`${saldo.balance_type ?? 'saldo'}-${indice}`}>
          <span className="font-medium">
            {saldo.balance_amount.amount} {saldo.balance_amount.currency}
          </span>
          <span className="text-neutral-500"> · {saldo.name ?? saldo.balance_type ?? 'saldo'}</span>
        </li>
      ))}
    </ul>
  );
}

async function UltimeTransazioni({ accountUid }: { accountUid: string }) {
  const esito = await prova(() => getTransactionsPage(accountUid));
  if (!esito.ok) return <Errore>Transazioni non disponibili: {esito.errore}</Errore>;

  const { transactions, continuation_key } = esito.valore;
  if (transactions.length === 0) {
    return <p className="text-xs text-neutral-500">Nessuna transazione restituita.</p>;
  }

  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-neutral-500">
        {transactions.length} transazioni nella prima pagina
        {continuation_key !== undefined ? ' · altre pagine disponibili' : ''}
      </summary>
      <ul className="mt-2 space-y-1 font-mono">
        {transactions.slice(0, 5).map((t, indice) => (
          <li key={t.entry_reference ?? indice}>
            {t.booking_date ?? '—'} · {t.credit_debit_indicator ?? '—'} ·{' '}
            {t.transaction_amount.amount} {t.transaction_amount.currency}
          </li>
        ))}
      </ul>
    </details>
  );
}

function Conto({ account }: { account: EbAccount }) {
  return (
    <li className="space-y-1 border-t border-neutral-100 pt-3 first:border-0 first:pt-0 dark:border-neutral-900">
      <p className="text-sm font-medium">{describeAccount(account)}</p>
      <p className="font-mono text-xs text-neutral-500">uid {account.uid}</p>
      <Saldi accountUid={account.uid} />
      <UltimeTransazioni accountUid={account.uid} />
    </li>
  );
}

async function SessioneCorrente() {
  const sessionId = (await cookies()).get('eb_session_id')?.value;

  if (sessionId === undefined) {
    return (
      <p className="text-sm text-neutral-500">
        Nessuna sessione attiva. Avvia un&rsquo;autorizzazione qui sopra.
      </p>
    );
  }

  const esito = await prova(() => getSession(sessionId));
  if (!esito.ok) return <Errore>Sessione non leggibile: {esito.errore}</Errore>;

  const sessione = esito.valore;

  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-neutral-500">Banca</dt>
        <dd>
          {sessione.aspsp?.name ?? '—'} ({sessione.aspsp?.country ?? '—'})
        </dd>
        <dt className="text-neutral-500">Stato</dt>
        <dd>{sessione.status ?? '—'}</dd>
        <dt className="text-neutral-500">Valida fino a</dt>
        <dd>{sessione.access?.valid_until ?? '—'}</dd>
        <dt className="text-neutral-500">Conti</dt>
        <dd>{sessione.accounts.length}</dd>
      </dl>

      <ul className="space-y-3">
        {sessione.accounts.map((account) => (
          <Conto key={account.uid} account={account} />
        ))}
      </ul>
    </div>
  );
}

export default async function DebugEbPage({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string; ok?: string }>;
}) {
  const { errore, ok } = await searchParams;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Debug Enable Banking</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Verifica della Fase 1. Nessun dato viene salvato: quello che vedi arriva direttamente
          dall&rsquo;API a ogni caricamento della pagina.
        </p>
      </div>

      {errore !== undefined && <Errore>{errore}</Errore>}
      {ok !== undefined && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
          Autorizzazione completata.
        </p>
      )}

      <Riquadro titolo="Configurazione">
        <Configurazione />
      </Riquadro>

      <Riquadro titolo={`Connettori Revolut (${REVOLUT_COUNTRY})`}>
        <Connettori />
      </Riquadro>

      <Riquadro titolo="Sessione corrente">
        <SessioneCorrente />
      </Riquadro>
    </div>
  );
}
