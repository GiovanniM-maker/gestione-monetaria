'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  formattaEuro,
  giorniDaOggi,
  ordinaPerPeso,
  sommaCosti,
  totalePerTipo,
} from '@/lib/abbonamenti/formato';
import type {
  RigaAbbonamento,
  RigaEsclusa,
  RigaMetrica,
  VoceMetrica,
} from '@/lib/abbonamenti/formato';
import { BOTTONE_MINORE, CASELLA, ETICHETTA_CASELLA } from '@/lib/ui/controlli';
import type { Tinte } from '../grafici';

const GIUDIZI = [
  { valore: 'usato', etichetta: 'Lo uso' },
  { valore: 'non_usato', etichetta: 'Non lo uso' },
  { valore: 'da_valutare', etichetta: 'Da valutare' },
] as const;

const CADENZE: Record<string, string> = {
  weekly: 'settimanale',
  monthly: 'mensile',
  quarterly: 'trimestrale',
  yearly: 'annuale',
  irregular: 'senza cadenza',
};

/**
 * I due tipi sono presentati separati e mai sommati.
 *
 * Non e' una scelta grafica: rispondono a due azioni diverse. Un abbonamento
 * si disdice — e' un gesto, si fa una volta, il risparmio e' certo.
 * Un'abitudine si cambia, e cambiare un'abitudine non e' un gesto. Un totale
 * unico nasconderebbe quale delle due si puo' fare davvero.
 */
const TIPI = [
  {
    chiave: 'abbonamento',
    titolo: 'Abbonamenti',
    sottotitolo: 'Contratti che si rinnovano da soli. Si disdicono.',
  },
  {
    chiave: 'abitudine',
    titolo: 'Abitudini',
    sottotitolo: 'Nessun contratto da disdire: si ripete perche’ lo si rifa’.',
  },
] as const;

/** Importo che arriva dal database come stringa decimale, formattato per l'occhio. */
function euro(valore: string | null): string {
  if (valore === null) return '—';
  const { totale, nonLetti } = sommaCosti([valore]);
  return nonLetti > 0 ? '—' : formattaEuro(totale);
}

export function PannelloAbbonamenti({
  abbonamenti,
  metrica,
  escluse,
  nellaMetrica,
  totali,
  oggi,
  tinte,
}: {
  abbonamenti: readonly RigaAbbonamento[];
  metrica: readonly RigaMetrica[];
  escluse: readonly RigaEsclusa[];
  nellaMetrica: number;
  totali: number;
  oggi: string;
  /** Il colore di ogni classe, dalla tabella delle classi. */
  tinte: Tinte;
}) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [mostraTutti, setMostraTutti] = useState(false);

  const voci = ordinaPerPeso(metrica);
  const fuori = voci.filter((v) => !v.nelRicorrente);

  /**
   * Predefinito: solo cio' che entra nel numero. Il resto resta contato e a un
   * click di distanza — nasconderlo e basta farebbe credere che il numero
   * comprenda tutto.
   */
  const visibili = mostraTutti ? abbonamenti : abbonamenti.filter((a) => a.nella_metrica);

  async function scrivi(id: string, corpo: Record<string, unknown>) {
    setInCorso(id);
    setErrore(null);
    try {
      const risposta = await fetch('/api/admin/abbonamenti', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, ...corpo }),
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
    <div className="space-y-8">
      {errore !== null && <p className="nota nota-errore text-[14px]">{errore}</p>}

      {/* -------------------------------------------------------------- */}
      {/* I DUE NUMERI                                                    */}
      {/* -------------------------------------------------------------- */}
      {voci.length === 0 ? (
        <p className="scheda p-6 text-center text-[14px] text-testo-2">
          Nessuna ricorrenza rilevata. Il rilevamento si lancia dal pannello di{' '}
          <a className="underline" href="/debug/sync">
            sincronizzazione
          </a>
          , bottone <strong>6 · Rileva abbonamenti</strong>.
        </p>
      ) : (
        TIPI.map((t) => {
          // Solo le classi che entrano nel totale: quelle fuori hanno un blocco
          // loro, sotto, perche' proporre di disdirle o di cambiarle sarebbe
          // proporre esattamente cio' che l'utente ha dichiarato di non voler
          // fare.
          const suoi = voci.filter((v) => v.tipo === t.chiave && v.nelRicorrente);
          if (suoi.length === 0) return null;
          return (
            <Blocco
              id={t.chiave}
              key={t.chiave}
              titolo={t.titolo}
              sottotitolo={t.sottotitolo}
              voci={suoi}
              totale={totalePerTipo(voci, t.chiave)}
              tinte={tinte}
            />
          );
        })
      )}

      {/* -------------------------------------------------------------- */}
      {/* SOTTO LA LINEA                                                  */}
      {/* -------------------------------------------------------------- */}
      {/* Il ricorrente che non si tocca. Non e' nascosto e non e' un avviso:
          e' la parte della ripartizione che il totale non conta, e mostrarla
          e' l'unica cosa che rende onesto il totale.

          Non e' diviso fra abbonamenti e abitudini: quella distinzione esiste
          per dire quale azione e' possibile, e qui non ne e' prevista
          nessuna. */}
      {fuori.length > 0 && (
        <Blocco
          titolo="Fuori dal totale"
          sottotitolo="Ricorrente, ma dichiarato non da togliere. Resta nella ripartizione, non nella somma."
          voci={fuori}
          totale={fuori.reduce((s, v) => s + v.costoMensile, 0n)}
          tinte={tinte}
        />
      )}

      {/* -------------------------------------------------------------- */}
      {/* COSA RESTA FUORI                                                */}
      {/* -------------------------------------------------------------- */}
      {escluse.length > 0 && (
        <div className="nota nota-avviso text-[13px]">
          <p className="font-medium text-attenzione">Cosa i numeri qui sopra non contano</p>
          <ul className="mt-1 space-y-0.5 text-attenzione">
            {escluse.map((e) => (
              <li key={e.motivo}>
                {e.motivo}: {e.esercenti} {e.esercenti === 1 ? 'esercente' : 'esercenti'}, spesi in
                tutto <span className="tabular-nums">{euro(e.totale_speso)}</span>
                {euro(e.costo_mensile_potenziale) !== '0,00 €' && (
                  <>
                    {' '}
                    — varrebbero{' '}
                    <span className="tabular-nums">{euro(e.costo_mensile_potenziale)}</span> al mese
                  </>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-attenzione">
            Serve essere presenti in almeno tre mesi civili <em>e</em> su almeno 75 giorni coperti.
            La seconda condizione non &egrave; ridondante: un intervallo di 63 giorni attraversa
            sempre tre mesi civili, e senza di lei dieci addebiti concentrati in due mesi
            diventavano un costo mensile che non &egrave; mai stato sostenuto per un mese. Sotto la
            soglia resta il totale, che &egrave; misurato.
          </p>
        </div>
      )}

      {/* -------------------------------------------------------------- */}
      {/* IL DETTAGLIO                                                    */}
      {/* -------------------------------------------------------------- */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium">
            {visibili.length} {visibili.length === 1 ? 'ricorrenza' : 'ricorrenze'}
          </h2>
          <label className={ETICHETTA_CASELLA}>
            <input
              type="checkbox"
              className={CASELLA}
              checked={mostraTutti}
              onChange={(e) => setMostraTutti(e.target.checked)}
            />
            mostra anche le escluse ({totali - nellaMetrica})
          </label>
        </div>

        {/*
          Schede e non una tabella.
          La tabella aveva otto colonne, e otto colonne su un telefono
          significano scorrimento laterale: si legge il nome oppure l'importo,
          mai i due insieme, e il confronto fra due righe diventa impossibile.
          La scheda tiene insieme le informazioni della stessa ricorrenza e si
          allarga in griglia dove c'e' spazio, invece di chiedere allo schermo
          di adattarsi a una forma pensata per un altro schermo.
        */}
        <ul className="grid gap-2 lg:grid-cols-2">
          {visibili.map((a) => (
            <Scheda
              key={a.id}
              riga={a}
              oggi={oggi}
              occupato={inCorso !== null}
              onScrivi={(corpo) => void scrivi(a.id, corpo)}
            />
          ))}
        </ul>
      </div>

      <div className="space-y-3 scheda p-3 text-xs text-testo-2">
        <p>
          <strong>Da dove viene il numero «al mese».</strong> Per un canone davvero fisso &egrave;
          il canone stesso: Netflix dice 6,99, che &egrave; la cifra che riconosci. Per tutto il
          resto — servizi a consumo e abitudini — &egrave; quanto &egrave; realmente uscito diviso
          il tempo in cui &egrave; uscito. Nessuna estrapolazione da un intervallo: assumere una
          cadenza dove non c&rsquo;&egrave; &egrave; il modo di ottenere cifre gonfiate.
        </p>
        <p>
          <strong>Il confine fra abbonamento e abitudine</strong> lo dice il flag{' '}
          <code>is_subscription</code> sull&rsquo;esercente, e si corregge da{' '}
          <a className="underline" href="/revisione">
            /revisione
          </a>
          . Non &egrave; una statistica: nessun numero distingue un contratto da una consuetudine, e
          un abbonamento nuovo che nessuno ha ancora marcato finisce fra le abitudini — visibile e
          contato, non perso.
        </p>
        <p>
          <strong>Un limite da sapere prima di stupirsi.</strong> Lo storico parte dal 23 settembre
          2025. Un canone <strong>annuale</strong> in undici mesi compare una volta sola, e una
          volta non &egrave; una cadenza: gli abbonamenti annuali diventano visibili da s&eacute; il
          23 settembre 2026, quando il conto compie un anno. Non &egrave; un difetto del
          rilevamento, &egrave; l&rsquo;et&agrave; dei dati.
        </p>
      </div>
    </div>
  );
}

function Scheda({
  riga: a,
  oggi,
  occupato,
  onScrivi,
}: {
  riga: RigaAbbonamento;
  oggi: string;
  occupato: boolean;
  onScrivi: (corpo: Record<string, unknown>) => void;
}) {
  const giorni = a.next_expected === null ? null : giorniDaOggi(a.next_expected, oggi);
  const disdetto = a.status === 'cancelled';
  const spento = disdetto || a.status === 'lapsed';

  return (
    <li className={`scheda p-3 ${spento ? 'opacity-60' : ''}`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className={`font-medium ${disdetto ? 'line-through' : ''}`}>{a.esercente}</span>
        <span className="shrink-0 text-right tabular-nums">
          {euro(a.costo_mensile)}
          <span className="text-xs font-normal text-testo-2">/mese</span>
        </span>
      </div>

      <p className="mt-0.5 text-xs text-testo-2">
        {a.tipo} · {a.categoria ?? 'senza categoria'} · {a.discrezionalita ?? 'non classificato'}
        {a.status !== 'active' && ` · ${a.status === 'lapsed' ? 'fermo' : 'disdetto'}`}
      </p>

      {/*
        Due colonne di dati anche a 360 pixel: sono coppie etichetta-valore
        corte, e impilarle in una sola colonna allungherebbe la scheda al punto
        da non farne stare due sullo schermo.
      */}
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
        <Dato voce="cadenza" valore={CADENZE[a.cadence] ?? a.cadence} />
        <Dato voce="prezzo" valore={euro(a.typical_amount)} />
        <Dato
          voce="prossimo"
          valore={
            a.next_expected === null
              ? '—'
              : giorni === null
                ? a.next_expected
                : giorni < 0
                  ? `in ritardo di ${-giorni} g`
                  : `fra ${giorni} g`
          }
        />
        <Dato voce="movimenti" valore={`${a.occurrences} in ${a.active_months} mesi`} />
        <Dato voce="speso in tutto" valore={euro(a.total_amount)} />
        <Dato
          voce="regolarità / importo"
          valore={`${a.confidence ?? '—'} / ${a.amount_stability ?? '—'}`}
        />
      </dl>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {GIUDIZI.map((g) => (
          <button
            key={g.valore}
            type="button"
            disabled={occupato}
            onClick={() =>
              onScrivi({ usageVerdict: a.usage_verdict === g.valore ? null : g.valore })
            }
            className={`${BOTTONE_MINORE} ${
              a.usage_verdict === g.valore ? 'bg-accento text-accento-testo' : ''
            }`}
          >
            {g.etichetta}
          </button>
        ))}
        {a.tipo === 'abbonamento' && (
          <button
            type="button"
            disabled={occupato}
            onClick={() => onScrivi({ disdetto: !disdetto })}
            className={BOTTONE_MINORE}
          >
            {disdetto ? 'Annulla disdetta' : 'Disdetto'}
          </button>
        )}
      </div>
    </li>
  );
}

function Dato({ voce, valore }: { voce: string; valore: string }) {
  return (
    <div>
      <dt className="text-testo-2">{voce}</dt>
      <dd className="tabular-nums">{valore}</dd>
    </div>
  );
}

function Blocco({
  id,
  titolo,
  sottotitolo,
  voci,
  totale,
  tinte,
}: {
  /** L'ancora: le tessere del cruscotto arrivano qui con `#abbonamento`. */
  id?: string;
  titolo: string;
  sottotitolo: string;
  voci: readonly VoceMetrica[];
  totale: bigint;
  tinte: Tinte;
}) {
  return (
    <div id={id} className="scroll-mt-4 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <h2 className="text-[17px] font-semibold tracking-[-0.02em]">{titolo}</h2>
          <p className="text-[13px] text-testo-3">{sottotitolo}</p>
        </div>
        <p className="numerone text-[22px] whitespace-nowrap">
          {formattaEuro(totale)}
          <span className="text-[12px] font-normal text-testo-3">/mese</span>
        </p>
      </div>
      {/* Il pallino della classe e' lo stesso del cruscotto e della barra
          segmentata. Delle tessere grigie identiche si distinguono solo
          leggendole; con il colore la piu' pesante si riconosce prima. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {voci.map((v) => (
          <div key={`${v.discrezionalita}-${v.contesto}`} className="scheda p-4">
            <p className="flex items-center gap-1.5 text-[12px] text-testo-2">
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-full"
                style={{ background: tinte[v.discrezionalita] ?? 'var(--neutro)' }}
              />
              <span className="min-w-0 truncate">{v.classeNome}</span>
            </p>
            <p className="text-[12px] text-testo-3">{v.contesto}</p>
            <p className="numerone mt-1.5 text-[19px] whitespace-nowrap">
              {formattaEuro(v.costoMensile)}
            </p>
            <p className="mt-0.5 text-[12px] text-testo-3">
              {v.ricorrenze} {v.ricorrenze === 1 ? 'voce' : 'voci'}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
