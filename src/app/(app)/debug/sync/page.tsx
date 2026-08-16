import type { Metadata } from 'next';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { comeArray } from '@/lib/enablebanking/redact';
import { PannelloBackfill } from './pannello-backfill';
import type { AccountRow, BankConnectionRow, SyncRunRow } from '@/lib/db/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Ingestion' };

function Riquadro({ titolo, children }: { titolo: string; children: React.ReactNode }) {
  return (
    <section className="scheda p-4">
      <h2 className="mb-3 text-sm font-semibold tracking-tight">{titolo}</h2>
      {children}
    </section>
  );
}

function quando(valore: string | null): string {
  if (valore === null) return '—';
  return new Date(valore).toLocaleString('it-IT', { timeZone: 'Europe/Rome' });
}

export default async function DebugSyncPage() {
  const supabase = await createSupabaseServerClient();

  const [{ data: connessioni }, { data: conti }, { data: corse }, { count: righeGrezze }] =
    await Promise.all([
      supabase.from('bank_connections').select('*').order('created_at'),
      supabase.from('accounts').select('*').order('created_at'),
      supabase.from('sync_runs').select('*').order('started_at', { ascending: false }).limit(10),
      supabase.from('raw_transactions').select('*', { count: 'exact', head: true }),
    ]);

  const [{ count: movimenti }, { data: perMese }] = await Promise.all([
    supabase.from('transactions').select('*', { count: 'exact', head: true }),
    supabase.from('v_expenses_by_month').select('*').order('mese', { ascending: false }),
  ]);
  const mesi = comeArray<{
    mese: string;
    movimenti: number;
    totale_eur: string | null;
    senza_cambio: number;
  }>(perMese);

  const elencoConnessioni = comeArray<BankConnectionRow>(connessioni);
  const elencoConti = comeArray<AccountRow>(conti);
  const elencoCorse = comeArray<SyncRunRow>(corse);

  // Una corsa e' riprendibile se non e' arrivata in fondo e ha ancora un
  // cursore da cui ripartire. Senza questo elenco, una corsa interrotta da un
  // ricarico di pagina resterebbe irraggiungibile: il suo identificativo viveva
  // solo nello stato del componente.
  const corseRiprendibili = elencoCorse
    .filter(
      (r) =>
        (r.status === 'running' || r.status === 'failed') &&
        r.cursor !== null &&
        !(r.cursor.current === null && r.cursor.pending.length === 0),
    )
    .map((r) => ({
      id: r.id,
      started_at: r.started_at,
      status: r.status,
      rows_fetched: r.rows_fetched,
    }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold tracking-[-0.03em]">Ingestion</h1>
        <p className="mt-1 text-[13px] text-testo-2">
          Fase 2. I payload arrivano integrali in <code>raw_transactions</code>, che non viene mai
          modificata ne&rsquo; cancellata. La normalizzazione e&rsquo; lavoro della Fase 3.
        </p>
      </div>

      <Riquadro titolo="Connessioni">
        {elencoConnessioni.length === 0 ? (
          <p className="text-sm text-testo-2">
            Nessuna connessione. Registra i conti dal pannello qui sotto.
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {elencoConnessioni.map((c) => (
              <li key={c.id}>
                <span className="font-medium">
                  {c.aspsp_name} ({c.aspsp_country})
                </span>
                <span className="text-testo-2">
                  {' '}
                  · {c.status} · consenso fino al {quando(c.valid_until)} · ultimo sync{' '}
                  {quando(c.last_sync_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Riquadro>

      <Riquadro titolo={`Conti (${elencoConti.length})`}>
        {elencoConti.length === 0 ? (
          <p className="text-sm text-testo-2">Nessun conto registrato.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {elencoConti.map((c) => (
              <li key={c.id}>
                <span className="font-medium">{c.name ?? 'Conto'}</span>
                <span className="text-testo-2">
                  {' '}
                  · {c.iban_masked ?? '—'} · {c.currency} · {c.account_type ?? 'tipo ignoto'} ·{' '}
                  {c.include_in_totals ? 'nei totali' : 'escluso dai totali'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Riquadro>

      <Riquadro titolo="Backfill">
        <PannelloBackfill corseRiprendibili={corseRiprendibili} />
      </Riquadro>

      <Riquadro titolo={`Uscite per mese · ${movimenti ?? 0} movimenti normalizzati`}>
        {mesi.length === 0 ? (
          <p className="text-sm text-testo-2">
            Nessun movimento normalizzato. Premi <strong>3 · Normalizza</strong>.
          </p>
        ) : (
          <>
            <table className="w-full max-w-md text-left text-sm">
              <thead className="text-xs text-testo-2">
                <tr>
                  <th className="py-1 pr-4">mese</th>
                  <th className="py-1 pr-4 text-right">uscite</th>
                  <th className="py-1 text-right">totale</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {mesi.map((m) => (
                  <tr key={m.mese} className="border-t border-filo">
                    <td className="py-1 pr-4">{m.mese}</td>
                    <td className="py-1 pr-4 text-right">{m.movimenti}</td>
                    <td className="py-1 text-right">
                      {m.totale_eur ?? '—'}
                      {m.senza_cambio > 0 && (
                        <span className="text-attenzione"> · {m.senza_cambio} senza cambio</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-testo-2">
              Solo uscite reali: esclusi giroconti, rimborsi, conti fuori dai totali e movimenti a
              importo zero. E&rsquo; il numero da confrontare con l&rsquo;app della banca.
            </p>
          </>
        )}
      </Riquadro>

      <Riquadro titolo={`Righe grezze: ${righeGrezze ?? 0}`}>
        {elencoCorse.length === 0 ? (
          <p className="text-sm text-testo-2">Nessuna sincronizzazione eseguita.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-testo-2">
                <tr>
                  <th className="py-1 pr-3">avvio</th>
                  <th className="py-1 pr-3">tipo</th>
                  <th className="py-1 pr-3">stato</th>
                  <th className="py-1 pr-3">conti</th>
                  <th className="py-1 pr-3">lette</th>
                  <th className="py-1 pr-3">nuove</th>
                  <th className="py-1 pr-3">duplicate</th>
                  <th className="py-1">errore</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {elencoCorse.map((r) => (
                  <tr key={r.id} className="border-t border-filo">
                    <td className="py-1 pr-3">{quando(r.started_at)}</td>
                    <td className="py-1 pr-3">{r.trigger}</td>
                    <td className="py-1 pr-3">{r.status}</td>
                    <td className="py-1 pr-3">{r.accounts_synced}</td>
                    <td className="py-1 pr-3">{r.rows_fetched}</td>
                    <td className="py-1 pr-3">{r.rows_new}</td>
                    <td className="py-1 pr-3">{r.rows_duplicate}</td>
                    <td className="py-1 break-words text-allarme">{r.error_message ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Riquadro>
    </div>
  );
}
