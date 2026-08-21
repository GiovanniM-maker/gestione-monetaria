'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BOTTONE, BOTTONE_MINORE, CAMPO_PIENO } from '@/lib/ui/controlli';
import { Foglio } from '../foglio';

/**
 * La gestione di una conversazione: la stella, il titolo, l'eliminazione.
 *
 * ---------------------------------------------------------------------------
 * La stella e' un fatto, non una preferenza
 * ---------------------------------------------------------------------------
 * Una conversazione non salvata vive trenta giorni dall'ultimo messaggio, poi
 * la pulizia notturna la elimina. La stella la esclude per sempre. E' l'unico
 * controllo di questa applicazione che decide se un dato sopravvive, ed e' per
 * questo che sta in due posti — sulla riga dell'elenco e in cima alla chat —
 * invece che in un menu solo.
 *
 * ---------------------------------------------------------------------------
 * La scadenza si dice solo quando serve
 * ---------------------------------------------------------------------------
 * «Questa chat scade fra 19 giorni» ripetuto su ogni riga sarebbe rumore che
 * insegna a non leggere. L'informazione vive nel foglio di gestione, sempre —
 * e in vista solo quando mancano pochi giorni, con il gesto che la risolve
 * accanto (`NotaScadenza`).
 */

async function azione(corpo: Record<string, unknown>): Promise<string | null> {
  try {
    const risposta = await fetch('/api/admin/copilota', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    const esito = (await risposta.json()) as Record<string, unknown>;
    return risposta.ok ? null : String(esito['error'] ?? risposta.status);
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** La stella: accesa = la conversazione non scade mai. */
export function Stella({
  id,
  salvata,
  compatta = false,
}: {
  id: string;
  salvata: boolean;
  /** Sulle righe dell'elenco: solo il glifo, senza la superficie del tondo. */
  compatta?: boolean;
}) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function commuta() {
    if (inCorso) return;
    setInCorso(true);
    const esito = await azione({ azione: 'salva', id, salvata: !salvata });
    setInCorso(false);
    setErrore(esito);
    if (esito === null) router.refresh();
  }

  return (
    <button
      type="button"
      onClick={() => void commuta()}
      aria-pressed={salvata}
      disabled={inCorso}
      // Il perche' del fallimento nel `title` e il punto esclamativo al posto
      // della stella: un bottone che fallisce in silenzio e' un bottone che
      // «non funziona», e si preme dieci volte.
      title={errore ?? undefined}
      className={
        compatta
          ? 'inline-flex size-11 shrink-0 items-center justify-center rounded-full'
          : 'tondo shrink-0'
      }
    >
      <span className="sr-only">
        {errore !== null
          ? `Salvataggio fallito: ${errore}`
          : salvata
            ? 'Rimuovi dalle salvate'
            : 'Salva la conversazione'}
      </span>
      <span
        aria-hidden="true"
        className={`text-[18px] leading-none ${
          errore !== null ? 'text-allarme' : salvata ? 'text-accento' : 'text-testo-3'
        }`}
      >
        {errore !== null ? '!' : salvata ? '★' : '☆'}
      </span>
    </button>
  );
}

/**
 * La nota di scadenza imminente, con il gesto che la risolve accanto.
 * Compare solo sotto i quattro giorni: prima sarebbe rumore.
 */
export function NotaScadenza({ id, giorni }: { id: string; giorni: number }) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState(false);

  if (giorni > 3) return null;

  async function salva() {
    setInCorso(true);
    const errore = await azione({ azione: 'salva', id, salvata: true });
    setInCorso(false);
    if (errore === null) router.refresh();
  }

  return (
    <p className="nota nota-avviso flex items-center gap-3 text-[13px]">
      <span className="min-w-0 flex-1">
        Si elimina automaticamente{' '}
        {giorni === 0 ? 'oggi' : giorni === 1 ? 'domani' : `tra ${giorni} giorni`}.
      </span>
      <button
        type="button"
        onClick={() => void salva()}
        disabled={inCorso}
        className="shrink-0 font-medium text-accento"
      >
        Salva conversazione
      </button>
    </p>
  );
}

/** Il menu «•••» della chat: rinomina, elimina, e la scadenza detta per esteso. */
export function MenuConversazione({
  id,
  titolo,
  salvata,
  giorniAllaScadenza,
}: {
  id: string;
  titolo: string | null;
  salvata: boolean;
  giorniAllaScadenza: number | null;
}) {
  const router = useRouter();
  const [aperto, setAperto] = useState(false);
  const [nome, setNome] = useState(titolo ?? '');
  const [daConfermare, setDaConfermare] = useState(false);
  const [inCorso, setInCorso] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  async function esegui(nomeAzione: string, corpo: Record<string, unknown>) {
    setInCorso(nomeAzione);
    setErrore(null);
    const esito = await azione(corpo);
    setInCorso(null);
    if (esito !== null) {
      setErrore(esito);
      return false;
    }
    return true;
  }

  return (
    <>
      <button type="button" onClick={() => setAperto(true)} className="tondo shrink-0">
        <span className="sr-only">Gestisci la conversazione</span>
        <span aria-hidden="true" className="text-[17px] leading-none text-testo-2">
          •••
        </span>
      </button>

      <Foglio
        aperto={aperto}
        titolo="Questa conversazione"
        nota={
          salvata
            ? 'Salvata: non scade mai, finché non togli la stella.'
            : giorniAllaScadenza === null
              ? undefined
              : `Si elimina automaticamente tra ${giorniAllaScadenza} ${giorniAllaScadenza === 1 ? 'giorno' : 'giorni'}: le conversazioni non salvate vivono 30 giorni dall'ultimo messaggio.`
        }
        onChiudi={() => {
          setAperto(false);
          setDaConfermare(false);
          setErrore(null);
        }}
      >
        <div className="space-y-4 pb-2">
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              void esegui('rinomina', { azione: 'rinomina', id, titolo: nome }).then((ok) => {
                if (ok) {
                  setAperto(false);
                  router.refresh();
                }
              });
            }}
          >
            <label className="block text-[13px] text-testo-2" htmlFor="titolo-conversazione">
              Titolo
            </label>
            <input
              id="titolo-conversazione"
              className={CAMPO_PIENO}
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Il primo messaggio, se lasci vuoto"
              maxLength={120}
            />
            <button type="submit" className={BOTTONE} disabled={inCorso !== null}>
              Rinomina
            </button>
          </form>

          <div className="border-t border-filo pt-4">
            {daConfermare ? (
              <div className="space-y-2">
                <p className="text-[13px] text-testo-2">
                  Elimino la conversazione e tutti i suoi messaggi? Non si torna indietro.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={`${BOTTONE} bg-(--allarme)`}
                    disabled={inCorso !== null}
                    onClick={() => {
                      void esegui('elimina', { azione: 'elimina', id }).then((ok) => {
                        if (ok) router.push('/copilota');
                      });
                    }}
                  >
                    Elimina
                  </button>
                  <button
                    type="button"
                    className={BOTTONE_MINORE}
                    onClick={() => setDaConfermare(false)}
                  >
                    Annulla
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="inline-flex min-h-11 items-center text-[14px] font-medium text-allarme"
                onClick={() => setDaConfermare(true)}
              >
                Elimina la conversazione
              </button>
            )}
          </div>

          {errore !== null && <p className="nota nota-errore text-[13px]">{errore}</p>}
        </div>
      </Foglio>
    </>
  );
}
