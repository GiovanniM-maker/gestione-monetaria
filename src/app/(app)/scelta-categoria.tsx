'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Il selettore di categoria dentro una riga di elenco.
 *
 * Entrare in una scheda per cambiare una categoria costa due navigazioni e un
 * ritorno indietro, e su un telefono e' la differenza fra sistemare venti righe
 * e sistemarne tre. Qui si cambia dove si guarda.
 *
 * ---------------------------------------------------------------------------
 * La portata dipende dall'esercente, e sta scritta sotto il controllo
 * ---------------------------------------------------------------------------
 * E' un controllo solo, ma fa due cose diverse — ed e' voluto, perche' la cosa
 * giusta da fare dipende dal caso e non dallo schermo su cui si e':
 *
 *   esercente **fisso**     -> cambia la categoria dell'**esercente**, cioe' di
 *                              tutte le sue spese. E' quello che si vuole
 *                              davvero quando si vede «McDonald's» nel posto
 *                              sbagliato: correggerlo una volta per sempre;
 *   esercente **variabile** -> cambia **questa riga**, e la marca come corretta
 *                              a mano. E' il computer comprato da Amazon.
 *
 * Il testo sotto lo dice ogni volta. Un controllo che a volte tocca una riga e
 * a volte trecento senza avvisare sarebbe la cosa piu' pericolosa
 * dell'applicazione.
 */

export type Ambito =
  { tipo: 'esercente'; merchantId: string } | { tipo: 'movimento'; movimentoId: string };

export function SceltaCategoria({
  ambito,
  categoriaId,
  categorie,
  etichetta,
}: {
  ambito: Ambito;
  categoriaId: string | null;
  categorie: readonly { id: string; percorso: string }[];
  /** Se `true` mostra sotto una riga che dice fin dove arriva il cambio. */
  etichetta?: boolean;
}) {
  const router = useRouter();
  const [valore, setValore] = useState(categoriaId ?? '');
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function cambia(nuovo: string) {
    const prima = valore;
    setValore(nuovo);
    setInCorso(true);
    setErrore(null);
    try {
      const [url, metodo, corpo] =
        ambito.tipo === 'esercente'
          ? ([
              '/api/admin/tassonomia',
              'PATCH',
              { id: ambito.merchantId, category_id: nuovo === '' ? null : nuovo },
            ] as const)
          : ([
              '/api/admin/movimenti/classifica',
              'POST',
              { id: ambito.movimentoId, categoriaId: nuovo === '' ? null : nuovo },
            ] as const);

      const risposta = await fetch(url, {
        method: metodo,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(corpo),
      });
      if (!risposta.ok) {
        const esito = (await risposta.json()) as Record<string, unknown>;
        // Si torna al valore di prima: a schermo non deve restare una scelta
        // che il database non ha.
        setValore(prima);
        setErrore(String(esito['error'] ?? risposta.status));
        return;
      }
      router.refresh();
    } catch (e) {
      setValore(prima);
      setErrore(e instanceof Error ? e.message : String(e));
    } finally {
      setInCorso(false);
    }
  }

  return (
    <div className="w-full">
      <select
        value={valore}
        onChange={(e) => void cambia(e.target.value)}
        disabled={inCorso}
        aria-label="categoria"
        className={`min-h-11 w-full rounded-md border border-neutral-300 bg-white px-2 text-xs
                    dark:border-neutral-700 dark:bg-neutral-900 sm:min-h-9 ${
                      inCorso ? 'opacity-60' : ''
                    }`}
      >
        <option value="">— senza categoria —</option>
        {categorie.map((c) => (
          <option key={c.id} value={c.id}>
            {c.percorso}
          </option>
        ))}
      </select>

      {etichetta === true && (
        <p className="mt-0.5 text-[11px] text-neutral-500">
          {ambito.tipo === 'esercente'
            ? 'vale per tutte le spese di questo esercente'
            : 'vale solo per questa riga'}
        </p>
      )}

      {errore !== null && (
        <p className="mt-1 rounded-md bg-red-50 px-2 py-1 text-[11px] text-red-700 dark:bg-red-950 dark:text-red-300">
          {errore}
        </p>
      )}
    </div>
  );
}
