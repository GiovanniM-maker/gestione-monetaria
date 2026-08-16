'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { analizza, pezzi } from '@/lib/report/testo';
import type { MessaggioSalvato, PropostaSalvata } from '@/lib/copilota/messaggi';
import { GraficoCopilota } from './grafico';
import { BOTTONE, BOTTONE_MINORE, CAMPO_PIENO } from '@/lib/ui/controlli';

/**
 * La conversazione.
 *
 * Tre cose che non sono decorazione:
 *
 * - **le cifre non trovate nei dati** compaiono sotto il messaggio che le
 *   contiene. È l'unica difesa contro un modello che calcola che non dipenda
 *   dalla sua buona volontà, e nasconderla dietro un pannello la renderebbe
 *   inutile;
 * - **le operazioni eseguite** stanno in un blocco richiudibile. Chiuso non
 *   disturba, aperto dice esattamente da dove viene un numero — che è la
 *   domanda che ci si fa quando un numero sorprende;
 * - **le proposte di scrittura** sono schede con un bottone. Il testo lo scrive
 *   il server dagli argomenti risolti, non il modello: si approva ciò che
 *   succederà davvero.
 */

const ESEMPI = [
  'Come potrei spendere meno per mettere via più soldi?',
  'Fammi il grafico della mia spesa negli ultimi mesi',
  'Quanto ho speso in ristoranti il mese scorso?',
  // Le classi si rinominano, quindi un esempio che ne nomina una puo'
  // invecchiare. Questo non ne nomina nessuna e chiede la stessa cosa.
  'Qual è il mio costo ricorrente, classe per classe?',
];

type Riga = MessaggioSalvato & { locale?: boolean };

export function PannelloCopilota({
  conversazioneId,
  iniziali,
}: {
  conversazioneId: string;
  iniziali: readonly MessaggioSalvato[];
}) {
  const router = useRouter();
  const [righe, setRighe] = useState<readonly Riga[]>(iniziali);
  const [domanda, setDomanda] = useState('');
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const fondo = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fondo.current?.scrollIntoView({ block: 'end' });
  }, [righe.length, inCorso]);

  async function invia(testo: string) {
    const pulita = testo.trim();
    if (pulita === '' || inCorso) return;

    setInCorso(true);
    setErrore(null);
    setDomanda('');
    setRighe((precedenti) => [
      ...precedenti,
      {
        id: `locale-${precedenti.length}`,
        ruolo: 'utente',
        testo: pulita,
        strumenti: null,
        proposte: null,
        grafici: null,
        cifre_inventate: null,
        created_at: new Date().toISOString(),
        locale: true,
      },
    ]);

    try {
      const risposta = await fetch('/api/admin/copilota', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ azione: 'chiedi', conversazioneId, domanda: pulita }),
      });
      const esito = (await risposta.json()) as Record<string, unknown>;

      if (!risposta.ok) {
        setErrore(String(esito['error'] ?? risposta.status));
        return;
      }
      setRighe((precedenti) => [...precedenti, esito['messaggio'] as MessaggioSalvato]);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : String(e));
    } finally {
      setInCorso(false);
    }
  }

  async function applica(messaggioId: string, indice: number) {
    setInCorso(true);
    setErrore(null);
    try {
      const risposta = await fetch('/api/admin/copilota', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ azione: 'applica', messaggioId, indice }),
      });
      const esito = (await risposta.json()) as Record<string, unknown>;
      if (!risposta.ok) {
        setErrore(String(esito['error'] ?? risposta.status));
        return;
      }
      setRighe((precedenti) =>
        precedenti.map((r) =>
          r.id !== messaggioId || r.proposte === null
            ? r
            : {
                ...r,
                proposte: r.proposte.map((p, i) =>
                  i === indice ? { ...p, applicata_at: new Date().toISOString() } : p,
                ),
              },
        ),
      );
      // Gli aggregati sono cambiati: le altre schermate vanno rilette.
      router.refresh();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : String(e));
    } finally {
      setInCorso(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        {righe.length === 0 && (
          <div className="rounded-lg border border-dashed border-filo p-4">
            <p className="text-sm text-testo-2">Per esempio:</p>
            <ul className="mt-2 space-y-1">
              {ESEMPI.map((e) => (
                <li key={e}>
                  <button
                    type="button"
                    onClick={() => void invia(e)}
                    disabled={inCorso}
                    className="flex min-h-11 w-full items-center text-left text-sm text-testo-2 underline decoration-(--filo) underline-offset-4"
                  >
                    {e}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {righe.map((r) => (
          <Messaggio key={r.id} riga={r} occupato={inCorso} onApplica={applica} />
        ))}

        {inCorso && <p className="text-sm text-testo-2">sto guardando i dati…</p>}
        <div ref={fondo} />
      </div>

      {errore !== null && <p className="nota nota-errore text-[14px]">{errore}</p>}

      {/* La riga di scrittura resta in fondo alla pagina e non fissata allo
          schermo: su un telefono una barra fissa finisce sotto la tastiera, e
          il posto dove si scrive diventa quello che non si vede. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void invia(domanda);
        }}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <input
          value={domanda}
          onChange={(e) => setDomanda(e.target.value)}
          placeholder="chiedi qualcosa sulle tue spese"
          disabled={inCorso}
          className={CAMPO_PIENO}
          autoComplete="off"
        />
        <button type="submit" disabled={inCorso || domanda.trim() === ''} className={BOTTONE}>
          Chiedi
        </button>
      </form>
    </div>
  );
}

function Messaggio({
  riga,
  occupato,
  onApplica,
}: {
  riga: Riga;
  occupato: boolean;
  onApplica: (messaggioId: string, indice: number) => Promise<void>;
}) {
  if (riga.ruolo === 'utente') {
    return (
      <p className="ml-auto max-w-[85%] break-words rounded-2xl rounded-br-sm bg-accento px-3 py-2 text-sm text-accento-testo">
        {riga.testo}
      </p>
    );
  }

  return (
    <div className="max-w-[95%] space-y-2 break-words">
      <div className="space-y-2 text-sm">
        {analizza(riga.testo).map((blocco, i) =>
          blocco.tipo === 'titolo' ? (
            <h2 key={i} className="pt-1 text-sm font-semibold">
              {blocco.testo}
            </h2>
          ) : blocco.tipo === 'elenco' ? (
            <ul key={i} className="space-y-1 pl-4">
              {blocco.voci.map((voce, j) => (
                <li key={j} className="list-disc">
                  <Testo testo={voce} />
                </li>
              ))}
            </ul>
          ) : (
            <p key={i}>
              <Testo testo={blocco.testo} />
            </p>
          ),
        )}
      </div>

      {riga.cifre_inventate !== null && riga.cifre_inventate.length > 0 && (
        <p className="nota nota-avviso text-[13px]">
          <strong>
            {riga.cifre_inventate.length === 1
              ? 'Una cifra'
              : `${riga.cifre_inventate.length} cifre`}
          </strong>{' '}
          di questa risposta non compare nei dati letti: {riga.cifre_inventate.join(', ')}. Il
          copilota non dovrebbe calcolare niente — verificala prima di fidartene.
        </p>
      )}

      {riga.grafici?.map((g, i) => (
        <GraficoCopilota key={i} grafico={g} />
      ))}

      {riga.proposte?.map((p, i) => (
        <Scheda
          key={i}
          proposta={p}
          occupato={occupato}
          onApplica={() => void onApplica(riga.id, i)}
        />
      ))}

      {riga.strumenti !== null && riga.strumenti.length > 0 && (
        <details className="text-xs text-testo-2">
          <summary className="inline-flex min-h-11 cursor-pointer items-center">
            da dove vengono i numeri ({riga.strumenti.length})
          </summary>
          <ul className="mt-1 space-y-2">
            {riga.strumenti.map((s, i) => (
              <li key={i}>
                <code className="font-medium">{s.nome}</code>
                <pre className="mt-1 max-h-56 overflow-auto rounded-md bg-s3 p-2 text-[11px] leading-relaxed">
                  {JSON.stringify(s.argomenti)}
                  {'\n→ '}
                  {JSON.stringify(s.dati, null, 1)}
                </pre>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Scheda({
  proposta,
  occupato,
  onApplica,
}: {
  proposta: PropostaSalvata;
  occupato: boolean;
  onApplica: () => void;
}) {
  const fatta = proposta.applicata_at !== null;

  return (
    <div className="scheda p-3">
      <p className="text-xs uppercase tracking-wide text-testo-2">
        {fatta ? 'applicata' : 'da applicare'}
      </p>
      <p className="mt-1 text-sm">{proposta.descrizione}</p>
      {!fatta && (
        <button
          type="button"
          disabled={occupato}
          onClick={onApplica}
          className={`${BOTTONE_MINORE} mt-2`}
        >
          Applica
        </button>
      )}
    </div>
  );
}

function Testo({ testo }: { testo: string }) {
  return (
    <>
      {pezzi(testo).map((p, i) =>
        p.forte ? (
          <strong key={i} className="tabular-nums">
            {p.testo}
          </strong>
        ) : (
          <span key={i}>{p.testo}</span>
        ),
      )}
    </>
  );
}
