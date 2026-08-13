'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { RigaAvviso } from '@/lib/avvisi/leggi';
import { BOTTONE_MINORE, CASELLA, ETICHETTA_CASELLA } from '@/lib/ui/controlli';

const COLORI: Record<string, string> = {
  critical:
    'border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200',
  warning:
    'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200',
  info: 'border-neutral-200 dark:border-neutral-800',
};

/** Dove si va per fare qualcosa a proposito di questo avviso. */
function destinazione(a: RigaAvviso): { href: string; testo: string } | null {
  if (a.merchant_id !== null) return { href: `/esercente/${a.merchant_id}`, testo: 'l’esercente' };
  if (a.related_subscription_id !== null) return { href: '/abbonamenti', testo: 'le ricorrenze' };
  if (a.related_transaction_id !== null)
    return { href: `/movimenti/${a.related_transaction_id}`, testo: 'il movimento' };
  if (a.related_category_id !== null)
    return { href: `/categoria/${a.related_category_id}`, testo: 'la categoria' };
  if (a.type === 'session_expiring') return { href: '/debug/eb', testo: 'rinnova il consenso' };
  if (a.type === 'sync_failed') return { href: '/debug/sync', testo: 'la sincronizzazione' };
  return null;
}

export function PannelloAvvisi({ avvisi }: { avvisi: readonly RigaAvviso[] }) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [mostraChiusi, setMostraChiusi] = useState(false);

  const visibili = mostraChiusi ? avvisi : avvisi.filter((a) => a.status === 'new');
  const chiusi = avvisi.length - avvisi.filter((a) => a.status === 'new').length;

  async function cambia(id: string, stato: string) {
    setInCorso(id);
    setErrore(null);
    try {
      const risposta = await fetch('/api/admin/avvisi', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, stato }),
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
    <div className="space-y-3">
      {errore !== null && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {errore}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-neutral-500">
          {visibili.length} {visibili.length === 1 ? 'avviso' : 'avvisi'}
        </p>
        {chiusi > 0 && (
          <label className={ETICHETTA_CASELLA}>
            <input
              type="checkbox"
              className={CASELLA}
              checked={mostraChiusi}
              onChange={(e) => setMostraChiusi(e.target.checked)}
            />
            mostra anche i {chiusi} già chiusi
          </label>
        )}
      </div>

      {visibili.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-sm text-neutral-500 dark:border-neutral-700">
          Nessun avviso. Il costo ricorrente non è cambiato e i dati arrivano.
        </p>
      ) : (
        <ul className="space-y-2">
          {visibili.map((a) => {
            const dove = destinazione(a);
            return (
              <li
                key={a.id}
                className={`rounded-lg border p-3 ${COLORI[a.severity] ?? COLORI['info']} ${
                  a.status === 'new' ? '' : 'opacity-60'
                }`}
              >
                <p className="font-medium">{a.title}</p>
                <p className="mt-1 text-sm">{a.body}</p>
                <p className="mt-1 text-xs opacity-70">
                  {a.created_at.slice(0, 10)}
                  {a.status !== 'new' && ` · ${a.status === 'dismissed' ? 'ignorato' : 'letto'}`}
                </p>

                {a.status === 'new' && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {dove !== null && (
                      <Link className={BOTTONE_MINORE} href={dove.href}>
                        {dove.testo}
                      </Link>
                    )}
                    <button
                      type="button"
                      disabled={inCorso !== null}
                      onClick={() => void cambia(a.id, 'actioned')}
                      className={BOTTONE_MINORE}
                    >
                      Fatto
                    </button>
                    <button
                      type="button"
                      disabled={inCorso !== null}
                      onClick={() => void cambia(a.id, 'dismissed')}
                      className={BOTTONE_MINORE}
                    >
                      Ignora
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
