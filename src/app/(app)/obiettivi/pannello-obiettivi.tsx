'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BOTTONE, BOTTONE_MINORE, CAMPO_PIENO } from '@/lib/ui/controlli';
import type { DiscretionClassRow } from '@/lib/db/types';
import {
  descriviObiettivo,
  descriviScadenza,
  type RigaObiettivo,
  type TipoObiettivo,
} from '@/lib/copilota/obiettivi';
import { Foglio } from '../foglio';

/**
 * Gli obiettivi: crearli, rinnovarli, dimenticarli.
 *
 * ---------------------------------------------------------------------------
 * Il tipo decide la forma, e il modulo lo segue
 * ---------------------------------------------------------------------------
 * Un tetto di spesa senza cifra non e' un tetto; un obiettivo di liquidita' con
 * una categoria non vuol dire niente. Il `check` della `0055` lo impone
 * comunque — e' quello il posto che lo sa — ma un modulo che mostra i campi
 * sbagliati fa sbagliare e poi rimprovera. Qui i campi **compaiono e spariscono**
 * col tipo, cosi' la forma sbagliata non e' proprio esprimibile.
 *
 * ---------------------------------------------------------------------------
 * «Scaduto» e' uno stato, non un errore
 * ---------------------------------------------------------------------------
 * Non e' colorato di rosso e non chiede scusa: dice che una volta lo volevi, e
 * offre di rinnovarlo. Il rosso e' per le cose rotte, e un obiettivo scaduto e'
 * una domanda aperta — che e' esattamente cio' che deve sembrare.
 */

const TIPI: { valore: TipoObiettivo; nome: string; spiega: string }[] = [
  {
    valore: 'tetto_di_spesa',
    nome: 'Non più di…',
    spiega: 'Un limite mensile su una categoria o una classe.',
  },
  {
    valore: 'ridurre',
    nome: 'Spendere meno in…',
    spiega: 'Una direzione, senza una cifra. Il copilota ci guarda quando ti consiglia.',
  },
  {
    valore: 'liquidita_minima',
    nome: 'Tenere almeno…',
    spiega:
      'Quanto vuoi restare sul conto. Il copilota non lo sa ancora verificare: manca il saldo.',
  },
  {
    valore: 'risparmiare',
    nome: 'Mettere da parte…',
    spiega: 'Una somma da raggiungere entro la scadenza.',
  },
];

/** I tipi che hanno bisogno di una cifra, e quelli che hanno un bersaglio. */
const VUOLE_VALORE: Record<TipoObiettivo, boolean> = {
  tetto_di_spesa: true,
  liquidita_minima: true,
  risparmiare: true,
  ridurre: false,
};
const VUOLE_BERSAGLIO: Record<TipoObiettivo, boolean> = {
  tetto_di_spesa: true,
  ridurre: true,
  liquidita_minima: false,
  risparmiare: false,
};

const DURATE = [3, 6, 12, 24];

export function PannelloObiettivi({
  obiettivi,
  classi,
  categorie,
}: {
  obiettivi: readonly RigaObiettivo[];
  classi: readonly DiscretionClassRow[];
  categorie: readonly { id: string; percorso: string }[];
}) {
  const router = useRouter();
  const [aperto, setAperto] = useState(false);
  const [inCorso, setInCorso] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  const [tipo, setTipo] = useState<TipoObiettivo>('tetto_di_spesa');
  const [valore, setValore] = useState('');
  const [bersaglio, setBersaglio] = useState('');
  const [nota, setNota] = useState('');
  const [mesi, setMesi] = useState(6);

  async function scrivi(metodo: string, corpo: Record<string, unknown>, chiave: string) {
    setInCorso(chiave);
    setErrore(null);
    try {
      const risposta = await fetch('/api/admin/obiettivi', {
        method: metodo,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(corpo),
      });
      const esito = (await risposta.json()) as Record<string, unknown>;
      if (!risposta.ok) {
        setErrore(String(esito['error'] ?? risposta.status));
        return;
      }
      setAperto(false);
      azzera();
      router.refresh();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : String(e));
    } finally {
      setInCorso(null);
    }
  }

  function azzera() {
    setTipo('tetto_di_spesa');
    setValore('');
    setBersaglio('');
    setNota('');
    setMesi(6);
  }

  // Il bersaglio e' una categoria **o** una classe, e si distinguono dal
  // prefisso: due selettori accanto lascerebbero possibile sceglierli
  // entrambi, che il `check` rifiuterebbe dopo aver fatto compilare il modulo.
  const creabile =
    (!VUOLE_VALORE[tipo] || valore.trim() !== '') && (!VUOLE_BERSAGLIO[tipo] || bersaglio !== '');

  return (
    <div className="space-y-4">
      {errore !== null && <p className="nota nota-errore text-[13px]">{errore}</p>}

      <button type="button" onClick={() => setAperto(true)} className={BOTTONE}>
        + Nuovo obiettivo
      </button>

      {obiettivi.length === 0 ? (
        /* Un vuoto che spiega invece di dire «nessun risultato»: qui non manca
           niente, semplicemente non ne hai ancora dichiarato uno. */
        <p className="scheda p-5 text-[13px] text-testo-2">
          Non ne hai dichiarato nessuno. Un obiettivo non cambia nessun numero: serve al copilota
          per sapere <strong>cosa stai cercando di ottenere</strong>, e darti un consiglio che
          riguarda te invece di un consiglio da manuale.
        </p>
      ) : (
        <ul className="scheda elenco px-4">
          {obiettivi.map((o) => (
            <li key={o.id} className="py-3">
              <div className="flex items-start gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px]">{descriviObiettivo(o)}</span>
                  <span className="mt-0.5 block text-[12px] text-testo-3">
                    {descriviScadenza(o)}
                    {o.nota !== null && ` · ${o.nota}`}
                  </span>
                </span>

                {o.stato === 'scaduto' && (
                  <span className="shrink-0 rounded-full bg-s3 px-2 py-0.5 text-[11px] text-testo-2">
                    scaduto
                  </span>
                )}
              </div>

              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void scrivi('PATCH', { id: o.id, mesi: 6 }, `r-${o.id}`)}
                  disabled={inCorso !== null}
                  className={BOTTONE_MINORE}
                >
                  {inCorso === `r-${o.id}`
                    ? '…'
                    : o.stato === 'scaduto'
                      ? 'Vale ancora'
                      : 'Rinnova 6 mesi'}
                </button>
                <button
                  type="button"
                  onClick={() => void scrivi('DELETE', { id: o.id }, `d-${o.id}`)}
                  disabled={inCorso !== null}
                  className={BOTTONE_MINORE}
                >
                  {inCorso === `d-${o.id}` ? '…' : 'Dimentica'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Foglio
        aperto={aperto}
        titolo="Nuovo obiettivo"
        nota="Non cambia nessun numero: dice al copilota cosa stai cercando di ottenere."
        onChiudi={() => {
          setAperto(false);
          setErrore(null);
          azzera();
        }}
      >
        <div className="space-y-3">
          <label className="block">
            <span className="text-[12px] text-testo-2">che tipo</span>
            <select
              value={tipo}
              onChange={(e) => {
                const t = e.target.value as TipoObiettivo;
                setTipo(t);
                // I campi che il tipo nuovo non usa si svuotano: lasciarli
                // pieni manderebbe al database una forma che il `check`
                // rifiuta, dopo aver fatto credere che fosse valida.
                if (!VUOLE_VALORE[t]) setValore('');
                if (!VUOLE_BERSAGLIO[t]) setBersaglio('');
              }}
              className={CAMPO_PIENO}
              disabled={inCorso !== null}
            >
              {TIPI.map((t) => (
                <option key={t.valore} value={t.valore}>
                  {t.nome}
                </option>
              ))}
            </select>
          </label>
          <p className="text-[12px] text-testo-3">{TIPI.find((t) => t.valore === tipo)?.spiega}</p>

          {VUOLE_VALORE[tipo] && (
            <label className="block">
              <span className="text-[12px] text-testo-2">quanto, in euro</span>
              <input
                value={valore}
                onChange={(e) => setValore(e.target.value.replace(/[^\d.,]/g, ''))}
                inputMode="decimal"
                placeholder="300"
                className={CAMPO_PIENO}
                disabled={inCorso !== null}
              />
            </label>
          )}

          {VUOLE_BERSAGLIO[tipo] && (
            <label className="block">
              <span className="text-[12px] text-testo-2">su cosa</span>
              <select
                value={bersaglio}
                onChange={(e) => setBersaglio(e.target.value)}
                className={CAMPO_PIENO}
                disabled={inCorso !== null}
              >
                <option value="">— scegli —</option>
                <optgroup label="Classi">
                  {classi.map((c) => (
                    <option key={c.slug} value={`classe:${c.slug}`}>
                      {c.nome}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Categorie">
                  {categorie.map((c) => (
                    <option key={c.id} value={`categoria:${c.id}`}>
                      {c.percorso}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
          )}

          <label className="block">
            <span className="text-[12px] text-testo-2">per quanto vale</span>
            <select
              value={mesi}
              onChange={(e) => setMesi(Number(e.target.value))}
              className={CAMPO_PIENO}
              disabled={inCorso !== null}
            >
              {DURATE.map((m) => (
                <option key={m} value={m}>
                  {m} mesi
                </option>
              ))}
            </select>
          </label>
          <p className="text-[12px] text-testo-3">
            Alla scadenza non sparisce: resta qui, marcato, e il copilota ti chiede se vale ancora
            invece di darlo per buono.
          </p>

          <label className="block">
            <span className="text-[12px] text-testo-2">perché (facoltativo)</span>
            <input
              value={nota}
              onChange={(e) => setNota(e.target.value.slice(0, 280))}
              placeholder="sto mettendo via per il trasloco"
              className={CAMPO_PIENO}
              disabled={inCorso !== null}
            />
          </label>

          <button
            type="button"
            onClick={() =>
              void scrivi(
                'POST',
                {
                  tipo,
                  valore: valore.trim() === '' ? null : valore.trim().replace(',', '.'),
                  categoria_id: bersaglio.startsWith('categoria:') ? bersaglio.slice(10) : null,
                  classe: bersaglio.startsWith('classe:') ? bersaglio.slice(7) : null,
                  nota: nota.trim() === '' ? null : nota.trim(),
                  mesi,
                },
                'nuovo',
              )
            }
            disabled={inCorso !== null || !creabile}
            className={`${BOTTONE} disabled:opacity-40`}
          >
            {inCorso === 'nuovo' ? '…' : 'Crea'}
          </button>
        </div>
      </Foglio>
    </div>
  );
}
