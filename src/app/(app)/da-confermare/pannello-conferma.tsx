'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formattaEuro, sommaCosti } from '@/lib/abbonamenti/formato';
import type { RigaDaConfermare } from '@/lib/conferma/leggi';
import { BOTTONE, BOTTONE_MINORE, CAMPO_PIENO } from '@/lib/ui/controlli';

const DISCREZIONALITA = ['essenziale', 'investimento', 'utile', 'voluttuario'] as const;
const CONTESTI = ['personale', 'business'] as const;

function euro(valore: string | null): string {
  if (valore === null) return '—';
  const { totale, nonLetti } = sommaCosti([valore]);
  return nonLetti > 0 ? '—' : formattaEuro(totale);
}

export function PannelloConferma({ righe }: { righe: readonly RigaDaConfermare[] }) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [aperta, setAperta] = useState<string | null>(null);

  async function scrivi(corpo: Record<string, unknown>) {
    setInCorso(String(corpo['id']));
    setErrore(null);
    try {
      const risposta = await fetch('/api/admin/conferma', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(corpo),
      });
      const esito = (await risposta.json()) as Record<string, unknown>;
      if (!risposta.ok) {
        setErrore(String(esito['error'] ?? risposta.status));
        return;
      }
      setAperta(null);
      router.refresh();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : String(e));
    } finally {
      setInCorso(null);
    }
  }

  if (righe.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-300 p-6 text-sm text-neutral-500 dark:border-neutral-700">
        <p>Niente da confermare. Tutti i movimenti contabilizzati sono stati visti.</p>
        <p className="mt-2 text-xs">
          I movimenti ancora <strong>provvisori</strong> non compaiono qui: la banca non li ha
          contabilizzati, l&rsquo;importo pu&ograve; cambiare, e confermarli adesso vorrebbe dire
          riconfermarli dopo.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {errore !== null && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {errore}
        </p>
      )}

      <p className="text-sm text-neutral-500">
        {righe.length} {righe.length === 1 ? 'movimento' : 'movimenti'}
      </p>

      <ul className="space-y-2">
        {righe.map((r) => (
          <li
            key={r.id}
            className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0">
                <span className="block truncate font-medium">
                  {r.esercente ?? r.raw_description ?? '(senza descrizione)'}
                </span>
                <span className="text-xs text-neutral-500">{r.booking_date}</span>
              </span>
              <span className="shrink-0 tabular-nums">{euro(r.amount_eur ?? r.amount)}</span>
            </div>

            <p className="mt-1 text-xs text-neutral-500">
              {r.categoria ?? 'senza categoria'} · {r.discrezionalita ?? 'non classificato'}
              {r.contesto !== null && ` · ${r.contesto}`}
            </p>

            {/* Una proposta mai confermata va detta: vale per i conteggi, ma
                nessuno l'ha ancora guardata, ed e' la prima da mettere in
                dubbio. */}
            {r.origine_classificazione === 'ai' && r.esercente_confermato_at === null && (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                Proposta dal modello{r.motivazione !== null && `: ${r.motivazione}`}
              </p>
            )}

            {aperta === r.id ? (
              <Correzione
                riga={r}
                occupato={inCorso !== null}
                onAnnulla={() => setAperta(null)}
                onSalva={(corpo) => void scrivi({ id: r.id, ...corpo })}
              />
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={inCorso !== null}
                  onClick={() => void scrivi({ id: r.id })}
                  className={BOTTONE}
                >
                  Va bene
                </button>
                <button
                  type="button"
                  disabled={inCorso !== null}
                  onClick={() => setAperta(r.id)}
                  className={BOTTONE_MINORE}
                >
                  Correggi
                </button>
                {r.merchant_id !== null && (
                  <Link className={BOTTONE_MINORE} href={`/esercente/${r.merchant_id}`}>
                    l&rsquo;esercente
                  </Link>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Correzione({
  riga,
  occupato,
  onAnnulla,
  onSalva,
}: {
  riga: RigaDaConfermare;
  occupato: boolean;
  onAnnulla: () => void;
  onSalva: (corpo: Record<string, unknown>) => void;
}) {
  const [discrezionalita, setDiscrezionalita] = useState(riga.discrezionalita ?? '');
  const [contesto, setContesto] = useState(riga.contesto ?? '');
  const [note, setNote] = useState(riga.note ?? '');

  return (
    <div className="mt-3 space-y-2 border-t border-neutral-100 pt-3 dark:border-neutral-900">
      <p className="text-xs text-neutral-500">
        Vale solo per questa spesa. La categoria resta quella dell&rsquo;esercente: si cambia da{' '}
        <Link className="underline" href="/revisione">
          revisione
        </Link>
        , dove vale per tutte le sue occorrenze.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs text-neutral-500">discrezionalità</span>
          <select
            value={discrezionalita}
            onChange={(e) => setDiscrezionalita(e.target.value)}
            className={CAMPO_PIENO}
            disabled={occupato}
          >
            <option value="">— non cambiare —</option>
            {DISCREZIONALITA.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-neutral-500">contesto</span>
          <select
            value={contesto}
            onChange={(e) => setContesto(e.target.value)}
            className={CAMPO_PIENO}
            disabled={occupato}
          >
            <option value="">— non cambiare —</option>
            {CONTESTI.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="perché fa eccezione (facoltativo)"
        className={CAMPO_PIENO}
        disabled={occupato}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={occupato}
          className={BOTTONE}
          onClick={() =>
            onSalva({
              discrezionalita: discrezionalita === '' ? null : discrezionalita,
              contesto: contesto === '' ? null : contesto,
              note: note.trim() === '' ? null : note.trim(),
            })
          }
        >
          Salva la correzione
        </button>
        <button type="button" disabled={occupato} className={BOTTONE_MINORE} onClick={onAnnulla}>
          Annulla
        </button>
      </div>
    </div>
  );
}
