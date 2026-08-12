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
  avvisi?: readonly string[];
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
export type CorsaRiprendibile = {
  id: string;
  started_at: string;
  status: string;
  rows_fetched: number;
};

export function PannelloBackfill({
  corseRiprendibili,
}: {
  corseRiprendibili: readonly CorsaRiprendibile[];
}) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState(false);
  const [messaggi, setMessaggi] = useState<readonly string[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [fetteCorte, setFetteCorte] = useState(false);

  const aggiungi = (testo: string) => setMessaggi((precedenti) => [...precedenti, testo]);

  /**
   * `YYYY-MM-DD` di N mesi fa, nel fuso applicativo.
   *
   * Non `toISOString()`: quello formatta in UTC, e vicino a mezzanotte
   * restituirebbe il giorno prima. E' la stessa regola dei giorni civili che
   * vale per `booking_date`, e vale anche per un estremo di intervallo.
   */
  const mesiFa = (mesi: number): string => {
    const data = new Date();
    data.setMonth(data.getMonth() - mesi);
    return data.toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
  };

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
      aggiungi(
        `${esito.pagineLette} pagine · ${esito.righeLette} righe lette · ${esito.righeNuove} nuove · ` +
          `${esito.righeDuplicate} duplicate · ${esito.contiRimanenti} conti da fare`,
      );

      for (const avviso of esito.avvisi ?? []) aggiungi(`  ⚠ ${avviso}`);

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

  async function normalizza() {
    setInCorso(true);
    aggiungi('Normalizzazione dell\u2019intero registro grezzo\u2026');
    try {
      const risposta = await fetch('/api/admin/normalize', { method: 'POST' });
      const corpo = (await risposta.json()) as Record<string, unknown>;
      if (!risposta.ok) {
        aggiungi(`Errore: ${String(corpo['error'] ?? risposta.status)}`);
      } else {
        aggiungi(
          `${corpo['esaminate']} righe grezze esaminate \u00b7 ${corpo['inserite']} inserite \u00b7 ` +
            `${corpo['aggiornate']} aggiornate \u00b7 ${corpo['protette']} protette da correzione manuale \u00b7 ` +
            `${corpo['scartate']} scartate \u00b7 ${corpo['girocontiSpeculari']} giroconti speculari marcati`,
        );
        const errori = corpo['errori'];
        if (Array.isArray(errori) && errori.length > 0) {
          for (const e of errori) aggiungi(`  ${String(e)}`);
        }
        router.refresh();
      }
    } catch (errore) {
      aggiungi(`Errore di rete: ${errore instanceof Error ? errore.message : String(errore)}`);
    } finally {
      setInCorso(false);
    }
  }

  async function categorizza() {
    setInCorso(true);
    aggiungi('Applicazione della tassonomia…');
    try {
      const risposta = await fetch('/api/admin/categorize', { method: 'POST' });
      const corpo = (await risposta.json()) as Record<string, unknown>;
      if (!risposta.ok) {
        aggiungi(`Errore: ${String(corpo['error'] ?? risposta.status)}`);
        setInCorso(false);
        return;
      }

      const quota = (parte: number, tutto: number) =>
        tutto === 0 ? '0' : String(Math.round((parte / tutto) * 1000) / 10);

      const speseEsaminate = Number(corpo['speseEsaminate'] ?? 0);
      const speseAbbinate = Number(corpo['speseAbbinate'] ?? 0);

      // La copertura sulle spese reali per prima: e' l'unica che dice qualcosa.
      // Sul totale delle transazioni si misurerebbe anche quanto bene
      // categorizziamo i giroconti, che non vanno categorizzati.
      // In euro per prima: contare i movimenti sopravvaluta la coda, e la
      // metrica dell'app e' un importo, non un numero di righe.
      const euro = (v: unknown) => Number(String(v ?? '0'));
      const totale = euro(corpo['speseTotale']);
      const abbinato = euro(corpo['speseTotaleAbbinato']);
      aggiungi(
        `SPESE REALI in euro: ${abbinato.toFixed(2)} su ${totale.toFixed(2)} classificati ` +
          `(${quota(abbinato, totale)}%)`,
      );
      aggiungi(
        `SPESE REALI in movimenti: ${speseAbbinate} su ${speseEsaminate} ` +
          `(${quota(speseAbbinate, speseEsaminate)}%) · ` +
          `${speseEsaminate - speseAbbinate} da assegnare a mano`,
      );
      aggiungi(
        `In tutto: ${corpo['esaminate']} transazioni esaminate · ${corpo['abbinate']} abbinate · ` +
          `${corpo['protette']} protette da correzione manuale`,
      );

      const nonLetti = Number(corpo['importiNonLetti'] ?? 0);
      if (nonLetti > 0) {
        aggiungi(`  ⚠ ${nonLetti} importi non letti: l’ordine della lista qui sotto e’ parziale.`);
      }

      // L'elenco degli scoperti non e' un dettaglio diagnostico: e' la lista di
      // lavoro, ordinata per quanto costa ignorarla.
      const daGuardare = corpo['daGuardare'];
      if (Array.isArray(daGuardare) && daGuardare.length > 0) {
        aggiungi('  da assegnare a mano, per spesa decrescente:');
        for (const v of daGuardare.slice(0, 15)) {
          const r = v as { etichetta?: unknown; movimenti?: unknown; totale?: unknown };
          aggiungi(`    ${String(r.totale)}  ${String(r.movimenti)}x  ${String(r.etichetta)}`);
        }
      }
      router.refresh();
    } catch (errore) {
      aggiungi(`Errore di rete: ${errore instanceof Error ? errore.message : String(errore)}`);
    } finally {
      setInCorso(false);
    }
  }

  /**
   * Legge la risposta senza dare per scontato che sia JSON.
   *
   * Quando Vercel interrompe una funzione, il corpo e' HTML: `response.json()`
   * esplode e il `catch` di turno stampa "errore di rete", che e' vero e non
   * dice niente. Questo e' esattamente il modo in cui il primo tentativo di
   * proposta ha nascosto un timeout.
   */
  async function leggiRisposta(risposta: Response): Promise<Record<string, unknown>> {
    const testo = await risposta.text();
    try {
      return JSON.parse(testo) as Record<string, unknown>;
    } catch {
      throw new Error(
        `Il server ha risposto ${risposta.status} con qualcosa che non e' JSON: ` +
          `${testo.slice(0, 200).replace(/\s+/g, ' ')}`,
      );
    }
  }

  /**
   * Chiede le proposte a fette, finche' ce ne sono.
   *
   * Stesso schema del backfill: il server fa un lotto e dice quante ne
   * restano, il browser richiama. Serve perche' dieci chiamate al modello in
   * fila superano il tetto di durata di una funzione serverless.
   */
  async function proponi() {
    setInCorso(true);
    aggiungi('Chiedo al modello una proposta per gli esercenti mai visti\u2026');
    try {
      for (let fetta = 1; ; fetta += 1) {
        const risposta = await fetch('/api/admin/proponi', { method: 'POST' });
        const corpo = await leggiRisposta(risposta);

        if (!risposta.ok) {
          aggiungi(`Errore: ${String(corpo['error'] ?? risposta.status)}`);
          return;
        }

        aggiungi(
          `fetta ${fetta}: ${corpo['inviate']} inviate \u00b7 ${corpo['proposte']} proposte \u00b7 ` +
            `${corpo['scartate']} scartate \u00b7 ${corpo['rimaste']} rimaste`,
        );

        const errori = corpo['errori'];
        if (Array.isArray(errori)) for (const e of errori) aggiungi(`  \u26a0 ${String(e)}`);

        if (corpo['progresso'] !== true) {
          aggiungi(
            Number(corpo['rimaste'] ?? 0) === 0
              ? 'Finito: non resta niente da proporre.'
              : 'Mi fermo: questa fetta non ha prodotto nessuna proposta valida.',
          );
          break;
        }
        if (Number(corpo['rimaste'] ?? 0) === 0) {
          aggiungi('Finito: tutte le etichette inviabili hanno una proposta.');
          break;
        }
      }

      aggiungi(
        'Le proposte sono in /revisione, marcate come da confermare. ' +
          'Quelle su cui il modello non era sicuro lo dichiarano nella motivazione.',
      );
      router.refresh();
    } catch (errore) {
      aggiungi(`${errore instanceof Error ? errore.message : String(errore)}`);
    } finally {
      setInCorso(false);
    }
  }

  async function riprendi(id: string) {
    setInCorso(true);
    aggiungi(`Ripresa della corsa ${id.slice(0, 8)}…`);
    try {
      await eseguiCiclo(urlRipresa(id));
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
        <div>
          <label className="text-xs text-neutral-500">
            da
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="mt-1 block rounded-md border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            />
          </label>
          {/* Lo storico lungo si ottiene solo chiedendolo: a date vuote la banca
              risponde con la sua finestra predefinita. Il bottone esiste perche'
              quella data si digita una volta sola, nell'ora dopo
              l'autorizzazione, e sbagliarla non e' recuperabile. */}
          <button
            type="button"
            onClick={() => setDateFrom(mesiFa(24))}
            disabled={inCorso}
            className="mt-1 text-[11px] text-neutral-500 underline underline-offset-2 disabled:opacity-40"
          >
            24 mesi fa
          </button>
        </div>
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
        <button type="button" onClick={normalizza} disabled={inCorso} className={stileBottone}>
          3 · Normalizza
        </button>
        <button type="button" onClick={categorizza} disabled={inCorso} className={stileBottone}>
          4 · Categorizza
        </button>
        <button type="button" onClick={proponi} disabled={inCorso} className={stileBottone}>
          5 · Proponi con l&rsquo;AI
        </button>
      </div>

      {corseRiprendibili.length > 0 && (
        <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950">
          <p className="text-xs text-amber-800 dark:text-amber-300">
            {corseRiprendibili.length === 1
              ? 'Una corsa non e\u2019 arrivata in fondo. Il suo cursore e\u2019 salvato: riprenderla continua da dove si era fermata, senza riscaricare nulla.'
              : `${corseRiprendibili.length} corse non sono arrivate in fondo. I loro cursori sono salvati: riprenderle continua da dove si erano fermate.`}
          </p>
          <div className="flex flex-wrap gap-2">
            {corseRiprendibili.map((corsa) => (
              <button
                key={corsa.id}
                type="button"
                onClick={() => void riprendi(corsa.id)}
                disabled={inCorso}
                className="rounded-md border border-amber-400 px-3 py-1 text-xs disabled:opacity-40 dark:border-amber-800"
              >
                Riprendi{' '}
                {new Date(corsa.started_at).toLocaleString('it-IT', {
                  timeZone: 'Europe/Rome',
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}{' '}
                · {corsa.status} · {corsa.rows_fetched} righe
              </button>
            ))}
          </div>
        </div>
      )}

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
        A date vuote la banca risponde con la sua <strong>finestra predefinita</strong>, che su
        Revolut si e&rsquo; vista di 90 giorni: per lo storico lungo la data va chiesta
        esplicitamente. Se la banca la rifiuta, il backfill ripiega sulla finestra predefinita e lo
        dice, invece di fallire. Procede a fette: se chiudi la pagina a meta&rsquo;, lo stato resta
        salvato e riparte da li&rsquo;.
      </p>

      {messaggi.length > 0 && (
        <pre className="max-h-64 overflow-auto rounded bg-neutral-100 p-2 text-[11px] leading-snug dark:bg-neutral-900">
          {messaggi.join('\n')}
        </pre>
      )}
    </div>
  );
}
