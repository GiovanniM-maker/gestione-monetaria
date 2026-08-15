import { cookies } from 'next/headers';
import type { Metadata } from 'next';
import {
  describeAccount,
  getAccountDetails,
  getBalances,
  getSession,
  getTransactionsPage,
  listAspsps,
} from '@/lib/enablebanking/client';
import { ebConfigStatus } from '@/lib/enablebanking/config';
import { comeArray, jsonRedatto } from '@/lib/enablebanking/redact';
import type { EbAspsp, EbBalance, EbTransaction } from '@/lib/enablebanking/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Debug Enable Banking' };

/**
 * Pagina di verifica della Fase 1: mostra le risposte grezze dell'API, non e'
 * una schermata di prodotto.
 *
 * Due regole che questa pagina rispetta per costruzione:
 *
 * 1. Non deve poter restituire 500. Un campo assente o di forma inattesa deve
 *    produrre una riga che lo dice, non una pagina bianca — altrimenti proprio
 *    lo strumento che serve a diagnosticare diventa la cosa da diagnosticare.
 *    Da qui `comeArray` su ogni collezione e nessun accesso diretto a `.length`
 *    su valori che arrivano dalla rete.
 * 2. Gli IBAN si mostrano mascherati anche nei dump grezzi (regola 7): ci pensa
 *    `jsonRedatto`.
 *
 * Sta dentro il route group `(app)`, quindi `requireUser()` del layout la
 * protegge gia': senza, esporrebbe i saldi.
 */

const REVOLUT_COUNTRY = 'LT';

type Esito<T> = { ok: true; valore: T } | { ok: false; errore: string };

async function prova<T>(chiamata: () => Promise<T>): Promise<Esito<T>> {
  try {
    return { ok: true, valore: await chiamata() };
  } catch (errore) {
    return { ok: false, errore: errore instanceof Error ? errore.message : String(errore) };
  }
}

function Riquadro({ titolo, children }: { titolo: string; children: React.ReactNode }) {
  return (
    <section className="scheda p-4">
      <h2 className="mb-3 text-sm font-semibold tracking-tight">{titolo}</h2>
      {children}
    </section>
  );
}

function Errore({ children }: { children: React.ReactNode }) {
  return <p className="nota nota-errore text-[14px] break-words">{children}</p>;
}

function Grezzo({ etichetta, valore }: { etichetta: string; valore: unknown }) {
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-xs text-testo-2">{etichetta}</summary>
      <pre className="mt-1 max-h-72 overflow-auto rounded bg-s3 p-2 text-[11px] leading-snug">
        {jsonRedatto(valore)}
      </pre>
    </details>
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
            <span className="text-testo-2">· {riga.dettaglio}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

async function Connettori() {
  const esito = await prova(() => listAspsps(REVOLUT_COUNTRY));
  if (!esito.ok) return <Errore>Lettura connettori fallita: {esito.errore}</Errore>;

  const tutti = comeArray<EbAspsp>(esito.valore);
  const revolut = tutti.filter((a) => typeof a.name === 'string' && /revolut/i.test(a.name));

  if (revolut.length === 0) {
    return (
      <Errore>
        Nessun connettore Revolut sotto {REVOLUT_COUNTRY}. Connettori letti: {tutti.length}.
      </Errore>
    );
  }

  return (
    <ul className="space-y-2">
      {revolut.map((aspsp, indice) => (
        <li
          key={`${aspsp.name}-${aspsp.country}-${indice}`}
          className="flex items-center justify-between gap-4 text-sm"
        >
          <span>
            {aspsp.name} <span className="text-testo-2">({aspsp.country})</span>
            {typeof aspsp.maximum_consent_validity === 'number' && (
              <span className="text-testo-2">
                {' '}
                · consenso max {Math.round(aspsp.maximum_consent_validity / 86400)} giorni
              </span>
            )}
          </span>
          <form action="/api/eb/authorize" method="post">
            <input type="hidden" name="aspsp_name" value={aspsp.name} />
            <input type="hidden" name="aspsp_country" value={aspsp.country} />
            {/* Il massimo dichiarato dal connettore viaggia con la richiesta: e'
                quello che si chiede, perche' ogni scadenza costa una SCA. */}
            {typeof aspsp.maximum_consent_validity === 'number' && (
              <input
                type="hidden"
                name="max_consent_seconds"
                value={String(aspsp.maximum_consent_validity)}
              />
            )}
            <button
              type="submit"
              className="rounded-md bg-testo px-3 py-1 text-xs font-medium text-s1"
            >
              Autorizza
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}

async function IntestazioneConto({ accountUid }: { accountUid: string }) {
  const esito = await prova(() => getAccountDetails(accountUid));
  if (!esito.ok) {
    return <Errore>Dettagli non disponibili: {esito.errore}</Errore>;
  }
  return (
    <>
      <p className="text-sm font-medium">{describeAccount(esito.valore)}</p>
      <Grezzo etichetta="risposta grezza · details" valore={esito.valore} />
    </>
  );
}

async function Saldi({ accountUid }: { accountUid: string }) {
  const esito = await prova(() => getBalances(accountUid));
  if (!esito.ok) return <Errore>Saldi non disponibili: {esito.errore}</Errore>;

  const saldi = comeArray<EbBalance>(
    (esito.valore as { balances?: unknown } | undefined)?.balances ?? esito.valore,
  );

  return (
    <>
      {saldi.length === 0 ? (
        <p className="text-xs text-testo-2">Nessun saldo nella risposta.</p>
      ) : (
        <ul className="text-sm">
          {saldi.map((saldo, indice) => (
            <li key={indice}>
              <span className="font-medium">
                {saldo.balance_amount?.amount ?? '—'} {saldo.balance_amount?.currency ?? ''}
              </span>
              <span className="text-testo-2"> · {saldo.name ?? saldo.balance_type ?? 'saldo'}</span>
            </li>
          ))}
        </ul>
      )}
      <Grezzo etichetta="risposta grezza · balances" valore={esito.valore} />
    </>
  );
}

async function UltimeTransazioni({ accountUid }: { accountUid: string }) {
  const esito = await prova(() => getTransactionsPage(accountUid));
  if (!esito.ok) return <Errore>Transazioni non disponibili: {esito.errore}</Errore>;

  const risposta = esito.valore as { transactions?: unknown; continuation_key?: unknown };
  const movimenti = comeArray<EbTransaction>(risposta?.transactions);

  return (
    <>
      <p className="text-xs text-testo-2">
        {movimenti.length} transazioni nella prima pagina
        {typeof risposta?.continuation_key === 'string' ? ' · altre pagine disponibili' : ''}
      </p>
      {movimenti.length > 0 && (
        <ul className="mt-1 space-y-0.5 font-mono text-xs">
          {movimenti.slice(0, 5).map((t, indice) => (
            <li key={indice}>
              {t.booking_date ?? '—'} · {t.credit_debit_indicator ?? '—'} ·{' '}
              {t.transaction_amount?.amount ?? '—'} {t.transaction_amount?.currency ?? ''}
            </li>
          ))}
        </ul>
      )}
      <Grezzo etichetta="risposta grezza · transactions (prima pagina)" valore={esito.valore} />
    </>
  );
}

function Conto({ accountUid }: { accountUid: string }) {
  return (
    <li className="space-y-1 border-t border-filo pt-3 first:border-0 first:pt-0">
      <IntestazioneConto accountUid={accountUid} />
      <p className="font-mono text-xs break-all text-testo-2">uid {accountUid}</p>
      <Saldi accountUid={accountUid} />
      <UltimeTransazioni accountUid={accountUid} />
    </li>
  );
}

/**
 * Estrae gli uid dalla sessione senza dare per scontata la forma.
 * `GET /sessions/{id}` documenta `accounts` come elenco di stringhe e
 * `accounts_data` come elenco di oggetti, ma l'unica versione affidabile e'
 * quella che risponde davvero, quindi si accettano entrambe.
 */
function estraiUid(sessione: unknown): readonly string[] {
  const s = sessione as { accounts?: unknown; accounts_data?: unknown };

  const daAccounts = comeArray<unknown>(s?.accounts)
    .map((voce) =>
      typeof voce === 'string' ? voce : ((voce as { uid?: unknown })?.uid ?? undefined),
    )
    .filter((uid): uid is string => typeof uid === 'string' && uid !== '');

  if (daAccounts.length > 0) return daAccounts;

  return comeArray<{ uid?: unknown }>(s?.accounts_data)
    .map((voce) => voce?.uid)
    .filter((uid): uid is string => typeof uid === 'string' && uid !== '');
}

async function SessioneCorrente() {
  const sessionId = (await cookies()).get('eb_session_id')?.value;

  if (sessionId === undefined) {
    return (
      <p className="text-sm text-testo-2">
        Nessuna sessione attiva. Avvia un&rsquo;autorizzazione qui sopra.
      </p>
    );
  }

  const esito = await prova(() => getSession(sessionId));
  if (!esito.ok) return <Errore>Sessione non leggibile: {esito.errore}</Errore>;

  // La sessione viene letta come struttura sconosciuta: i campi si estraggono
  // uno a uno, cosi' una risposta di forma diversa produce trattini e non un 500.
  const sessione = (esito.valore ?? {}) as {
    status?: unknown;
    aspsp?: { name?: unknown; country?: unknown };
    access?: { valid_until?: unknown };
  };
  const uids = estraiUid(esito.valore);

  const testo = (valore: unknown): string =>
    typeof valore === 'string' || typeof valore === 'number' ? String(valore) : '—';

  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-testo-2">Banca</dt>
        <dd>
          {testo(sessione.aspsp?.name)} ({testo(sessione.aspsp?.country)})
        </dd>
        <dt className="text-testo-2">Stato</dt>
        <dd>{testo(sessione.status)}</dd>
        <dt className="text-testo-2">Valida fino a</dt>
        <dd>{testo(sessione.access?.valid_until)}</dd>
        <dt className="text-testo-2">Conti</dt>
        <dd>{uids.length}</dd>
      </dl>

      <Grezzo etichetta="risposta grezza · sessione" valore={esito.valore} />

      {uids.length === 0 ? (
        <Errore>
          La sessione non contiene nessun identificativo di conto riconoscibile. Guarda la risposta
          grezza qui sopra per capire come si chiama il campo.
        </Errore>
      ) : (
        <ul className="space-y-3">
          {uids.map((uid) => (
            <Conto key={uid} accountUid={uid} />
          ))}
        </ul>
      )}
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
        <p className="mt-1 text-sm text-testo-2 text-testo-3">
          Verifica della Fase 1. Nessun dato viene salvato: quello che vedi arriva direttamente
          dall&rsquo;API a ogni caricamento della pagina. Gli IBAN sono mascherati anche nei dump
          grezzi.
        </p>
      </div>

      {errore !== undefined && <Errore>{errore}</Errore>}
      {ok !== undefined && (
        <p className="nota nota-esito text-[14px]">Autorizzazione completata.</p>
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
