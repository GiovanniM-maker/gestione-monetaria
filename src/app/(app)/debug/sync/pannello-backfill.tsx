'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type EsitoFetta = {
  runId: string;
  status: string;
  completato: boolean;
  pagineLette: number;
  righeLette: number;
  righeNuove: number;
  righeDuplicate: number;
  contiCompletati: number;
  contiRimanenti: number;
  errore: string | null;
};

/**
 * Pannello di comando del backfill.
 *
 * Il ciclo di ripresa vive qui, nel browser: il server esegue una fetta e
 * risponde "non ho finito", il browser richiama con lo stesso `run_id` finche'
 * non arriva "finito". E' il motivo per cui il backfill non dipende dal
 * completamento di una singola invocazione serverless — e anche il motivo per
 * cui chiudere questa scheda a meta' non rompe niente: lo stato e' nel cursore
 * salvato sul database, e basta ripremere Riprendi.
 */
export function PannelloBackfill() {
  const router = useRouter();
  const [inCorso, setInCorso] = useState(false);
  const [messaggi, setMessaggi] = useState<readonly string[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [fetteCorte, setFetteCorte] = useState(false);

  const aggiungi = (testo: string) => setMessaggi((precedenti) => [...precedenti, testo]);

  async function registraConti() {
    setInCorso(true);
    aggiungi('Registrazione conti…');
    try {
      const risposta = await fetch('/api/admin/sync-accounts', { method: 'POST' });
      const corpo: unknown = await risposta.json();
      if (!risposta.ok) {
        aggiungi(`Errore: ${(corpo as { error?: string }).error ?? risposta.status}`);
      } else {
        const conti = (corpo as { accounts?: unknown[] }).accounts ?? [];
        aggiungi(`Registrati ${conti.length} conti.`);
        router.refresh();
      }
    } catch (errore) {
      aggiungi(`Errore di rete: ${errore instanceof Error ? errore.message : String(errore)}`);
    } finally {
      setInCorso(false);
    }
  }

  /** Il budget viaggia anche nelle riprese, o la fetta successiva tornerebbe lunga. */
  const urlRipresa = (id: string) => {
    const parametri = new URLSearchParams({ run_id: id });
    if (fetteCorte) parametri.set('budget_ms', '5000');
    return `/api/admin/backfill?${parametri.toString()}`;
  };

  /** Esegue fette finche' il server non dichiara il backfill completato. */
  async function eseguiCiclo(primaChiamata: string) {
    let url = primaChiamata;
    for (;;) {
      const risposta = await fetch(url, { method: 'POST' });
      const corpo: unknown = await risposta.json();

      if (!risposta.ok && (corpo as EsitoFetta).runId === undefined) {
        aggiungi(`Errore: ${(corpo as { error?: string }).error ?? risposta.status}`);
        return;
      }

      const esito = corpo as EsitoFetta;
      setRunId(esito.runId);
      aggiungi(
        `${esito.pagineLette} pagine · ${esito.righeLette} righe lette · ${esito.righeNuove} nuove · ` +
          `${esito.righeDuplicate} duplicate · ${esito.contiRimanenti} conti da fare`,
      );

      if (esito.errore !== null) {
        aggiungi(`Interrotto: ${esito.errore}. Il cursore e' salvato, puoi riprendere.`);
        return;
      }

      if (esito.completato) {
        aggiungi('Backfill completato.');
        router.refresh();
        return;
      }

      url = urlRipresa(esito.runId);
    }
  }

  async function avvia() {
    setInCorso(true);
    setMessaggi([]);
    setRunId(null);
    const parametri = new URLSearchParams();
    if (dateFrom !== '') parametri.set('date_from', dateFrom);
    if (dateTo !== '') parametri.set('date_to', dateTo);
    if (fetteCorte) parametri.set('budget_ms', '5000');
    aggiungi('Avvio backfill…');
    try {
      await eseguiCiclo(`/api/admin/backfill?${parametri.toString()}`);
    } catch (errore) {
      aggiungi(`Errore di rete: ${errore instanceof Error ? errore.message : String(errore)}`);
    } finally {
      setInCorso(false);
    }
  }

  async function riprendi() {
    if (runId === null) return;
    setInCorso(true);
    aggiungi('Ripresa…');
    try {
      await eseguiCiclo(urlRipresa(runId));
    } catch (errore) {
      aggiungi(`Errore di rete: ${errore instanceof Error ? errore.message : String(errore)}`);
    } finally {
      setInCorso(false);
    }
  }

  const stileBottone =
    'rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-neutral-500">
          da
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="mt-1 block rounded-md border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
        <label className="text-xs text-neutral-500">
          a
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="mt-1 block rounded-md border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>

        <button type="button" onClick={registraConti} disabled={inCorso} className={stileBottone}>
          1 · Registra conti
        </button>
        <button type="button" onClick={avvia} disabled={inCorso} className={stileBottone}>
          2 · Avvia backfill
        </button>
        <button
          type="button"
          onClick={riprendi}
          disabled={inCorso || runId === null}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-neutral-700"
        >
          Riprendi
        </button>
      </div>

      <label className="flex items-center gap-2 text-xs text-neutral-500">
        <input
          type="checkbox"
          checked={fetteCorte}
          onChange={(e) => setFetteCorte(e.target.checked)}
          disabled={inCorso}
        />
        Fette da 5 secondi — serve a verificare la ripresa: il backfill si spezza in piu&rsquo;
        tranche anche su uno storico corto.
      </label>

      <p className="text-xs text-neutral-500">
        Lasciare le date vuote chiede tutto lo storico che la banca concede. Il backfill procede a
        fette: se chiudi la pagina a meta&rsquo;, lo stato resta salvato e riparte da li&rsquo;.
      </p>

      {messaggi.length > 0 && (
        <pre className="max-h-64 overflow-auto rounded bg-neutral-100 p-2 text-[11px] leading-snug dark:bg-neutral-900">
          {messaggi.join('\n')}
        </pre>
      )}
    </div>
  );
}
