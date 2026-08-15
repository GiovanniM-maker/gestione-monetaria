'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formattaEuro, sommaCosti } from '@/lib/abbonamenti/formato';
import type { RigaDaConfermare } from '@/lib/conferma/leggi';
import { BOTTONE, BOTTONE_MINORE, CAMPO_PIENO } from '@/lib/ui/controlli';
import { COLORE_CLASSE } from '../grafici';

/**
 * La schermata piu' usata dell'applicazione, e l'unica che si apre per fare una
 * cosa invece che per guardarla.
 *
 * ---------------------------------------------------------------------------
 * Una carta per volta, non una riga di tabella
 * ---------------------------------------------------------------------------
 * Le righe erano dense e i bottoni piccoli in fondo: si leggeva bene con un
 * mouse e si sbagliava col pollice. Ogni movimento e' una carta con il suo
 * nome grande, l'importo grande, e i due gesti larghi quanto la colonna —
 * perche' il gesto e' l'unica ragione per cui questa schermata esiste.
 *
 * ---------------------------------------------------------------------------
 * «Va bene tutte»
 * ---------------------------------------------------------------------------
 * Due giorni saltati e la lista della sera diventa quindici righe identiche.
 * Una lista di arretrati non si smaltisce: si chiude. Il bottone chiede
 * conferma una volta — sono quindici approvazioni, non una — e resta a valle
 * dell'elenco: si preme dopo aver letto, non al posto di leggere.
 *
 * Nessuna delle due strade marca `manually_categorized`: «va bene» approva una
 * regola, non incide un valore.
 */

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
  const [tutteChieste, setTutteChieste] = useState(false);

  async function scrivi(corpo: Record<string, unknown>, chiave: string) {
    setInCorso(chiave);
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
      setTutteChieste(false);
      router.refresh();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : String(e));
    } finally {
      setInCorso(null);
    }
  }

  /**
   * «Sei in pari».
   *
   * Non e' un riquadro vuoto con scritto «nessun risultato»: e' la schermata
   * che si vede piu' spesso quando l'abitudine ha preso, e vale la pena che
   * dica una cosa buona invece di sembrare rotta.
   */
  if (righe.length === 0) {
    return (
      <div className="scheda space-y-3 p-6 text-center">
        <p
          className="mx-auto flex size-14 items-center justify-center rounded-full text-[26px] leading-none"
          style={{
            background: 'color-mix(in oklab, var(--investimento) 18%, transparent)',
            color: 'var(--investimento)',
          }}
          aria-hidden="true"
        >
          ✓
        </p>
        <p className="text-[17px] font-semibold">Sei in pari.</p>
        <p className="text-[13px] text-testo-2">
          Tutti i movimenti contabilizzati sono stati visti.
        </p>
        <p className="text-[12px] text-testo-3">
          Quelli ancora <strong>provvisori</strong> non compaiono qui: la banca non li ha
          contabilizzati, l&rsquo;importo pu&ograve; cambiare, e confermarli adesso vorrebbe dire
          riconfermarli dopo.
        </p>
      </div>
    );
  }

  const occupato = inCorso !== null;

  return (
    <div className="space-y-3">
      {errore !== null && <p className="nota nota-errore text-[14px]">{errore}</p>}

      <p className="text-[13px] text-testo-2">
        {righe.length} {righe.length === 1 ? 'movimento' : 'movimenti'}
      </p>

      <ul className="space-y-3">
        {righe.map((r) => (
          <li key={r.id} className="scheda p-4">
            <Carta riga={r} />

            {aperta === r.id ? (
              <Correzione
                riga={r}
                occupato={occupato}
                onAnnulla={() => setAperta(null)}
                onSalva={(corpo) => void scrivi({ id: r.id, ...corpo }, r.id)}
              />
            ) : (
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  disabled={occupato}
                  onClick={() => void scrivi({ id: r.id }, r.id)}
                  className={`${BOTTONE} flex-1`}
                >
                  {inCorso === r.id ? '…' : 'Va bene'}
                </button>
                <button
                  type="button"
                  disabled={occupato}
                  onClick={() => setAperta(r.id)}
                  className={`${BOTTONE_MINORE} flex-1`}
                >
                  Correggi
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {/* In fondo e non in cima: si preme dopo aver letto, non al posto di
          leggere. */}
      {righe.length > 1 &&
        (tutteChieste ? (
          <div className="scheda space-y-3 p-4">
            <p className="text-[14px]">
              Approvo la classificazione proposta per tutti e{' '}
              <strong>{righe.length} i movimenti</strong>?
            </p>
            <p className="text-[12px] text-testo-3">
              Restano agganciati al loro esercente: se domani ne cambi la classificazione, la
              seguono. Niente viene inciso.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={occupato}
                className={`${BOTTONE} flex-1`}
                onClick={() => void scrivi({ ids: righe.map((r) => r.id) }, 'tutte')}
              >
                {inCorso === 'tutte' ? '…' : `Sì, approva le ${righe.length}`}
              </button>
              <button
                type="button"
                disabled={occupato}
                className={BOTTONE_MINORE}
                onClick={() => setTutteChieste(false)}
              >
                Annulla
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            disabled={occupato}
            className={`${BOTTONE_MINORE} w-full`}
            onClick={() => setTutteChieste(true)}
          >
            Va bene tutte
          </button>
        ))}
    </div>
  );
}

/** Il corpo della carta: chi, quanto, quando, e cosa ne pensa l'applicazione. */
function Carta({ riga: r }: { riga: RigaDaConfermare }) {
  const tinta = r.discrezionalita === null ? null : (COLORE_CLASSE[r.discrezionalita] ?? null);

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[17px] font-semibold">
            {r.esercente ?? r.raw_description ?? '(senza descrizione)'}
          </span>
          <span className="cifra text-[13px] text-testo-3">{r.booking_date}</span>
        </span>
        <span className="numerone shrink-0 text-[22px]">{euro(r.amount_eur ?? r.amount)}</span>
      </div>

      <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-testo-2">
        <span
          aria-hidden="true"
          className="size-2.5 shrink-0 rounded-full"
          style={{ background: tinta ?? 'var(--neutro)' }}
        />
        <span>{r.categoria ?? 'senza categoria'}</span>
        <span className="text-testo-3">·</span>
        <span>{r.discrezionalita ?? 'non classificato'}</span>
        {r.contesto !== null && (
          <>
            <span className="text-testo-3">·</span>
            <span>{r.contesto}</span>
          </>
        )}
      </p>

      {/* Una proposta mai confermata va detta: vale per i conteggi, ma nessuno
          l'ha ancora guardata, ed e' la prima da mettere in dubbio. */}
      {r.origine_classificazione === 'ai' && r.esercente_confermato_at === null && (
        <p className="mt-2 text-[12px] text-utile">
          Proposta dal modello{r.motivazione !== null && `: ${r.motivazione}`}
        </p>
      )}
    </>
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
    <div className="mt-4 space-y-3 border-t border-filo pt-4">
      <p className="text-[12px] text-testo-3">
        Vale solo per questa spesa. La categoria resta quella dell&rsquo;esercente: si cambia da{' '}
        <Link className="text-essenziale" href="/revisione">
          revisione
        </Link>
        , dove vale per tutte le sue occorrenze.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="text-[12px] text-testo-2">discrezionalità</span>
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
          <span className="text-[12px] text-testo-2">contesto</span>
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
      <div className="flex gap-2">
        <button
          type="button"
          disabled={occupato}
          className={`${BOTTONE} flex-1`}
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
