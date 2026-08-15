'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BOTTONE, BOTTONE_MINORE, CAMPO_PIENO } from '@/lib/ui/controlli';
import type { EsercenteMinimo } from '@/lib/movimenti/sposta';

/**
 * Spostare questo movimento su un altro esercente.
 *
 * È l'unica scrittura della scheda, e ha una giustificazione misurata invece
 * che ipotizzata — che è la condizione che `docs/cruscotto.md` §8 aveva posto
 * per uscire dalla sola lettura.
 *
 * Il caso: sotto `Apple` convivono undici canoni iCloud da 2,99 e cinque
 * acquisti di aprile per 444,65 €, con la stessa identica causale
 * `apple.com/bill`. Nessuna regola sulle stringhe li separa, e finché stanno
 * insieme il rilevatore dichiara un canone da 44,94 €/mese per un servizio che
 * ne costa 2,99 — quaranta euro nella riga «abbonamenti» della metrica
 * principale.
 *
 * Lo spostamento marca `manually_categorized`, quindi da lì in poi nessun
 * automatismo tocca più la riga. È lo stesso patto della correzione di fine
 * giornata, applicato al campo per cui non era ancora raggiungibile.
 */

const DISCREZIONALITA = ['essenziale', 'investimento', 'utile', 'voluttuario'] as const;
const CONTESTI = ['personale', 'business'] as const;

export function SpostaMovimento({
  id,
  esercenteAttuale,
  categorie,
}: {
  id: string;
  esercenteAttuale: string | null;
  categorie: readonly { id: string; percorso: string }[];
}) {
  const router = useRouter();
  const [aperto, setAperto] = useState(false);
  const [modo, setModo] = useState<'cerca' | 'nuovo'>('cerca');
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const [ricerca, setRicerca] = useState('');
  const [trovati, setTrovati] = useState<readonly EsercenteMinimo[]>([]);

  const [nome, setNome] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [discrezionalita, setDiscrezionalita] = useState('');
  const [contesto, setContesto] = useState('');
  const [abbonamento, setAbbonamento] = useState(false);

  async function cerca(testo: string) {
    setRicerca(testo);
    if (testo.trim().length < 2) {
      setTrovati([]);
      return;
    }
    try {
      const risposta = await fetch(
        `/api/admin/movimenti/sposta?q=${encodeURIComponent(testo.trim())}`,
      );
      const esito = (await risposta.json()) as { esercenti?: EsercenteMinimo[] };
      setTrovati(esito.esercenti ?? []);
    } catch {
      setTrovati([]);
    }
  }

  async function sposta(corpo: Record<string, unknown>) {
    setInCorso(true);
    setErrore(null);
    try {
      const risposta = await fetch('/api/admin/movimenti/sposta', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, ...corpo }),
      });
      const esito = (await risposta.json()) as Record<string, unknown>;
      if (!risposta.ok) {
        setErrore(String(esito['error'] ?? risposta.status));
        return;
      }
      setAperto(false);
      router.refresh();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : String(e));
    } finally {
      setInCorso(false);
    }
  }

  if (!aperto) {
    return (
      <button type="button" className={BOTTONE_MINORE} onClick={() => setAperto(true)}>
        Sposta su un altro esercente
      </button>
    );
  }

  return (
    <section className="space-y-3 scheda p-3">
      <p className="text-xs text-testo-2">
        Vale <strong>solo per questo movimento</strong>, che da qui in poi nessun automatismo
        toccher&agrave; pi&ugrave;. Serve quando la banca scrive due cose diverse con la stessa
        causale{esercenteAttuale !== null && ` — come su ${esercenteAttuale}`}.
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={modo === 'cerca' ? BOTTONE : BOTTONE_MINORE}
          onClick={() => setModo('cerca')}
        >
          Esercente esistente
        </button>
        <button
          type="button"
          className={modo === 'nuovo' ? BOTTONE : BOTTONE_MINORE}
          onClick={() => setModo('nuovo')}
        >
          Creane uno nuovo
        </button>
      </div>

      {modo === 'cerca' ? (
        <div className="space-y-2">
          <input
            value={ricerca}
            onChange={(e) => void cerca(e.target.value)}
            placeholder="cerca per nome"
            className={CAMPO_PIENO}
            disabled={inCorso}
            autoComplete="off"
          />
          <ul className="space-y-1">
            {trovati.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  disabled={inCorso}
                  onClick={() => void sposta({ merchantId: m.id })}
                  className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md px-2 text-left text-sm hover:bg-s3"
                >
                  <span className="truncate">{m.esercente}</span>
                  <span className="shrink-0 text-xs text-testo-2">
                    {m.categoria ?? 'senza categoria'}
                    {m.abbonamento && ' · abbonamento'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {ricerca.trim().length >= 2 && trovati.length === 0 && (
            <p className="text-xs text-testo-2">Nessun esercente con questo nome.</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="nome del nuovo esercente"
            className={CAMPO_PIENO}
            disabled={inCorso}
          />
          <select
            value={categoriaId}
            onChange={(e) => setCategoriaId(e.target.value)}
            className={CAMPO_PIENO}
            disabled={inCorso}
          >
            <option value="">— senza categoria —</option>
            {categorie.map((c) => (
              <option key={c.id} value={c.id}>
                {c.percorso}
              </option>
            ))}
          </select>
          <div className="grid gap-2 sm:grid-cols-2">
            <select
              value={discrezionalita}
              onChange={(e) => setDiscrezionalita(e.target.value)}
              className={CAMPO_PIENO}
              disabled={inCorso}
            >
              <option value="">— discrezionalità —</option>
              {DISCREZIONALITA.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <select
              value={contesto}
              onChange={(e) => setContesto(e.target.value)}
              className={CAMPO_PIENO}
              disabled={inCorso}
            >
              <option value="">— contesto —</option>
              {CONTESTI.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={abbonamento}
              onChange={(e) => setAbbonamento(e.target.checked)}
              disabled={inCorso}
              className="h-5 w-5"
            />
            è un abbonamento che si può disdire
          </label>
          <button
            type="button"
            disabled={inCorso || nome.trim() === ''}
            className={BOTTONE}
            onClick={() =>
              void sposta({
                merchantId: null,
                nuovo: {
                  nome: nome.trim(),
                  categoriaId: categoriaId === '' ? null : categoriaId,
                  discrezionalita: discrezionalita === '' ? null : discrezionalita,
                  contesto: contesto === '' ? null : contesto,
                  abbonamento,
                },
              })
            }
          >
            Crea e sposta
          </button>
        </div>
      )}

      {errore !== null && <p className="nota nota-errore text-[14px]">{errore}</p>}

      <button type="button" className={BOTTONE_MINORE} onClick={() => setAperto(false)}>
        Annulla
      </button>
    </section>
  );
}
