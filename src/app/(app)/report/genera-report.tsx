'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BOTTONE } from '@/lib/ui/controlli';

export function GeneraReport() {
  const router = useRouter();
  const [inCorso, setInCorso] = useState(false);
  const [messaggio, setMessaggio] = useState<string | null>(null);

  async function genera() {
    setInCorso(true);
    setMessaggio(null);
    try {
      const risposta = await fetch('/api/admin/report', { method: 'POST' });
      const corpo = (await risposta.json()) as Record<string, unknown>;
      if (!risposta.ok) {
        setMessaggio(String(corpo['error'] ?? risposta.status));
        return;
      }
      const anonimizzati = Number(corpo['anonimizzati'] ?? 0);
      setMessaggio(
        `Scritto. Costo ${Number(corpo['costo'] ?? 0).toFixed(4)} $` +
          (anonimizzati > 0
            ? ` · ${anonimizzati} nomi sostituiti con «un privato» prima di uscire`
            : ''),
      );
      router.refresh();
    } catch (e) {
      setMessaggio(e instanceof Error ? e.message : String(e));
    } finally {
      setInCorso(false);
    }
  }

  return (
    <div className="space-y-2">
      <button type="button" onClick={genera} disabled={inCorso} className={BOTTONE}>
        {inCorso ? 'Scrivo…' : 'Genera il report del mese scorso'}
      </button>
      {messaggio !== null && <p className="text-sm text-testo-2">{messaggio}</p>}
    </div>
  );
}
