'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formattaEuro, giorniDaOggi, ordinaPerPeso, sommaCosti } from '@/lib/abbonamenti/formato';
import type { RigaMetrica } from '@/lib/abbonamenti/formato';
import type { RigaAbbonamento, RigaEsclusa } from '@/lib/abbonamenti/rileva';

const GIUDIZI = [
  { valore: 'usato', etichetta: 'Lo uso' },
  { valore: 'non_usato', etichetta: 'Non lo uso' },
  { valore: 'da_valutare', etichetta: 'Da valutare' },
] as const;

const CADENZE: Record<string, string> = {
  weekly: 'settimanale',
  monthly: 'mensile',
  quarterly: 'trimestrale',
  yearly: 'annuale',
  irregular: 'irregolare',
};

/** Importo che arriva dal database come stringa decimale, formattato per l'occhio. */
function euro(valore: string | null): string {
  const { totale, nonLetti } = sommaCosti([valore]);
  return nonLetti > 0 ? '—' : formattaEuro(totale);
}

export function PannelloAbbonamenti({
  abbonamenti,
  metrica,
  escluse,
  attivi,
  totali,
  oggi,
}: {
  abbonamenti: readonly RigaAbbonamento[];
  metrica: readonly RigaMetrica[];
  escluse: readonly RigaEsclusa[];
  attivi: number;
  totali: number;
  oggi: string;
}) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [mostraTutti, setMostraTutti] = useState(false);

  const voci = ordinaPerPeso(metrica);
  const complessivo = voci.reduce((somma, v) => somma + v.costoMensile, 0n);

  /**
   * Predefinito: si mostrano solo gli abbonamenti che entrano nella metrica.
   * Gli altri restano contati e raggiungibili con un click — nascosti e basta
   * farebbero credere che il numero comprenda tutto.
   */
  const visibili = mostraTutti
    ? abbonamenti
    : abbonamenti.filter(
        (a) =>
          a.status === 'active' &&
          a.cadence !== 'irregular' &&
          Number(a.confidence ?? '0') >= 0.5,
      );

  async function scrivi(id: string, corpo: Record<string, unknown>) {
    setInCorso(id);
    setErrore(null);
    try {
      const risposta = await fetch('/api/admin/abbonamenti', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, ...corpo }),
      });
      const esito = (await risposta.json()) as Record<string, unknown>;
      if (!risposta.ok) {
        setErrore(String(esito['error'] ?? risposta.status));
        return;
      }
      router.refresh();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : String(e));
    } finally {
      setInCorso(null);
    }
  }

  return (
    <div className="space-y-6">
      {errore !== null && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {errore}
        </p>
      )}

      {/* -------------------------------------------------------------- */}
      {/* LA METRICA                                                      */}
      {/* -------------------------------------------------------------- */}
      {voci.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-sm text-neutral-500 dark:border-neutral-700">
          Nessuna ricorrenza rilevata. Il rilevamento si lancia dal pannello di{' '}
          <a className="underline" href="/debug/sync">
            sincronizzazione
          </a>
          , bottone <strong>6 · Rileva abbonamenti</strong>.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {voci.map((v) => (
              <div
                key={`${v.discrezionalita}-${v.contesto}`}
                className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
              >
                <p className="text-xs uppercase tracking-wide text-neutral-500">
                  {v.discrezionalita} · {v.contesto}
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {formattaEuro(v.costoMensile)}
                  <span className="text-sm font-normal text-neutral-500">/mese</span>
                </p>
                <p className="mt-1 text-xs text-neutral-500">
                  {v.abbonamenti} {v.abbonamenti === 1 ? 'abbonamento' : 'abbonamenti'}
                </p>
              </div>
            ))}
          </div>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            In tutto <strong className="tabular-nums">{formattaEuro(complessivo)}</strong> al mese di
            spesa ricorrente, su {attivi} abbonamenti attivi ({totali} rilevati in tutto).
          </p>
        </div>
      )}

      {/* -------------------------------------------------------------- */}
      {/* COSA RESTA FUORI                                                */}
      {/* -------------------------------------------------------------- */}
      {escluse.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs dark:border-amber-900 dark:bg-amber-950">
          <p className="font-medium text-amber-900 dark:text-amber-200">
            Cosa il numero qui sopra non conta
          </p>
          <ul className="mt-1 space-y-0.5 text-amber-800 dark:text-amber-300">
            {escluse.map((e) => (
              <li key={e.motivo}>
                {e.motivo}: {e.esercenti} esercenti, per{' '}
                <span className="tabular-nums">{euro(e.costo_mensile_potenziale)}</span> al mese
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* -------------------------------------------------------------- */}
      {/* IL DETTAGLIO                                                    */}
      {/* -------------------------------------------------------------- */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">
            {visibili.length} {visibili.length === 1 ? 'ricorrenza' : 'ricorrenze'}
          </h2>
          <label className="flex items-center gap-2 text-xs text-neutral-500">
            <input
              type="checkbox"
              checked={mostraTutti}
              onChange={(e) => setMostraTutti(e.target.checked)}
            />
            mostra anche quelle escluse dalla metrica ({totali - visibili.length})
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-neutral-500">
              <tr>
                <th className="py-1 pr-3">Esercente</th>
                <th className="py-1 pr-3">Cadenza</th>
                <th className="py-1 pr-3 text-right">Importo</th>
                <th className="py-1 pr-3 text-right">Al mese</th>
                <th className="py-1 pr-3">Prossimo</th>
                <th className="py-1 pr-3 text-right">N.</th>
                <th className="py-1 pr-3 text-right">Conf.</th>
                <th className="py-1">Giudizio</th>
              </tr>
            </thead>
            <tbody>
              {visibili.map((a) => {
                const giorni =
                  a.next_expected === null ? null : giorniDaOggi(a.next_expected, oggi);
                const disdetto = a.status === 'cancelled';
                return (
                  <tr
                    key={a.id}
                    className={`border-t border-neutral-200 align-top dark:border-neutral-800 ${
                      disdetto || a.status === 'lapsed' ? 'text-neutral-400' : ''
                    }`}
                  >
                    <td className="py-2 pr-3">
                      <span className={disdetto ? 'line-through' : ''}>{a.esercente}</span>
                      <span className="block text-xs text-neutral-500">
                        {a.categoria ?? 'senza categoria'} · {a.discrezionalita ?? 'non classificato'}
                        {a.status !== 'active' && ` · ${a.status === 'lapsed' ? 'fermo' : 'disdetto'}`}
                      </span>
                    </td>
                    <td className="py-2 pr-3">{CADENZE[a.cadence] ?? a.cadence}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {euro(a.expected_amount)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{euro(a.costo_mensile)}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {a.next_expected ?? '—'}
                      {giorni !== null && (
                        <span className="block text-xs text-neutral-500">
                          {giorni < 0 ? `in ritardo di ${-giorni} g` : `fra ${giorni} g`}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{a.occurrences}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{a.confidence ?? '—'}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-1">
                        {GIUDIZI.map((g) => (
                          <button
                            key={g.valore}
                            type="button"
                            disabled={inCorso !== null}
                            onClick={() =>
                              void scrivi(a.id, {
                                usageVerdict: a.usage_verdict === g.valore ? null : g.valore,
                              })
                            }
                            className={`rounded border px-2 py-0.5 text-xs disabled:opacity-40 ${
                              a.usage_verdict === g.valore
                                ? 'border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900'
                                : 'border-neutral-300 dark:border-neutral-700'
                            }`}
                          >
                            {g.etichetta}
                          </button>
                        ))}
                        <button
                          type="button"
                          disabled={inCorso !== null}
                          onClick={() => void scrivi(a.id, { disdetto: !disdetto })}
                          className="rounded border border-neutral-300 px-2 py-0.5 text-xs disabled:opacity-40 dark:border-neutral-700"
                        >
                          {disdetto ? 'Annulla disdetta' : 'Disdetto'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {visibili.length === 0 && totali > 0 && (
          <p className="text-xs text-neutral-500">
            Nessuna ricorrenza entra nella metrica. Spunta la casella qui sopra per vedere le{' '}
            {totali} rilevate e capire perch&eacute; restano fuori.
          </p>
        )}
      </div>

      <p className="text-xs text-neutral-500">
        Il giudizio d&rsquo;uso e la disdetta sono <strong>dichiarazioni tue</strong>: il
        rilevamento le rilegge ma non le riscrive mai. Un abbonamento disdetto oggi continua a
        produrre addebiti per un mese, e se il ricalcolo potesse riportarlo ad attivo il giudizio
        non servirebbe a niente.
      </p>

      <div className="rounded-lg border border-neutral-200 p-3 text-xs text-neutral-500 dark:border-neutral-800">
        <p>
          <strong>Un limite che vale la pena sapere prima di stupirsi.</strong> Servono almeno tre
          addebiti perch&eacute; ci sia una cadenza da misurare, e lo storico parte dal 23 settembre
          2025. Un canone <strong>annuale</strong> in undici mesi compare una volta sola, e una
          volta non &egrave; una cadenza: gli abbonamenti annuali diventano visibili da s&eacute; il
          23 settembre 2026, quando il conto compie un anno. Non &egrave; un difetto del
          rilevamento, &egrave; l&rsquo;et&agrave; dei dati.
        </p>
      </div>
    </div>
  );
}
