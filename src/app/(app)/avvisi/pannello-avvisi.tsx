'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { RigaAvviso } from '@/lib/avvisi/leggi';
import { BOTTONE_MINORE, CASELLA, ETICHETTA_CASELLA } from '@/lib/ui/controlli';
import { spiegaEccezione, spiegaRisposta, type Spiegazione } from '@/lib/ui/errori';
import { NotaErrore } from '@/lib/ui/nota-errore';

const COLORI: Record<string, string> = {
  critical: 'nota-errore',
  warning: 'nota-avviso',
  info: 'border-filo',
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
  /**
   * Quali avvisi stanno scrivendo, non «se qualcuno sta scrivendo». Da una
   * stringa sola veniva `disabled={inCorso !== null}`, cioe' chiudere un avviso
   * spegneva «Fatto» e «Ignora» su tutti gli altri: uno storico si smaltisce a
   * raffica, e ogni raffica costava un viaggio d'attesa.
   */
  const [inCorso, setInCorso] = useState<ReadonlySet<string>>(() => new Set());
  const [errore, setErrore] = useState<Spiegazione | null>(null);
  const [mostraChiusi, setMostraChiusi] = useState(false);

  const visibili = mostraChiusi ? avvisi : avvisi.filter((a) => a.status === 'new');
  const chiusi = avvisi.length - avvisi.filter((a) => a.status === 'new').length;

  async function cambia(id: string, stato: string) {
    setInCorso((q) => new Set(q).add(id));
    setErrore(null);
    try {
      const risposta = await fetch('/api/admin/avvisi', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, stato }),
      });
      if (!risposta.ok) {
        setErrore(await spiegaRisposta(risposta));
        return;
      }
      router.refresh();
    } catch (e) {
      setErrore(spiegaEccezione(e));
    } finally {
      setInCorso((q) => {
        const r = new Set(q);
        r.delete(id);
        return r;
      });
    }
  }

  return (
    <div className="space-y-3">
      <NotaErrore errore={errore} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sec text-testo-2">
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
        <p className="rounded-lg border border-dashed border-filo p-6 text-sec text-testo-2">
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
                <p className="mt-1 text-sec">{a.body}</p>
                <p className="mt-1 text-min opacity-70">
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
                      disabled={inCorso.has(a.id)}
                      onClick={() => void cambia(a.id, 'actioned')}
                      className={BOTTONE_MINORE}
                    >
                      Fatto
                    </button>
                    <button
                      type="button"
                      disabled={inCorso.has(a.id)}
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
