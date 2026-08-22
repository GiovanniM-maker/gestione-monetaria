'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BOTTONE } from '@/lib/ui/controlli';
import { spiegaEccezione, spiegaErrore, type Spiegazione } from '@/lib/ui/errori';
import { NotaErrore } from '@/lib/ui/nota-errore';

export function GeneraReport() {
  const router = useRouter();
  const [inCorso, setInCorso] = useState(false);
  const [messaggio, setMessaggio] = useState<string | null>(null);
  const [errore, setErrore] = useState<Spiegazione | null>(null);

  async function genera() {
    setInCorso(true);
    setMessaggio(null);
    setErrore(null);
    try {
      const risposta = await fetch('/api/admin/report', { method: 'POST' });
      const corpo = (await risposta.json()) as Record<string, unknown>;
      if (!risposta.ok) {
        setErrore(spiegaErrore(risposta.status, corpo));
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
      setErrore(spiegaEccezione(e));
    } finally {
      setInCorso(false);
    }
  }

  return (
    <div className="space-y-2">
      <button type="button" onClick={genera} disabled={inCorso} className={BOTTONE}>
        {inCorso ? 'Scrivo…' : 'Genera il report del mese scorso'}
      </button>
      <NotaErrore errore={errore} onRiprova={() => void genera()} />
      {messaggio !== null && <p className="text-sec text-testo-2">{messaggio}</p>}
    </div>
  );
}
