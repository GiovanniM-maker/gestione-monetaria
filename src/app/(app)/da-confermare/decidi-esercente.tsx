'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Foglio } from '../foglio';

/**
 * La domanda che si fa **una volta sola**, quando un nome nuovo compare.
 *
 * ---------------------------------------------------------------------------
 * Perche' qui e non sulla scheda dell'esercente
 * ---------------------------------------------------------------------------
 * La distinzione fra esercente **fisso** e **variabile** esiste dalla 0038, e
 * finora si dichiarava dalla sua scheda — cioe' in un posto dove si arriva solo
 * se si e' gia' capito che serve. Il momento in cui serve capirlo e' un altro:
 * e' la sera in cui quel nome compare per la prima volta in «Da confermare».
 *
 * E' la stessa idea del «+ Nuova categoria» dentro il selettore: **la decisione
 * si prende dove ci si accorge che va presa**, non due schermate piu' in la'.
 *
 * ---------------------------------------------------------------------------
 * Le due risposte non sono un interruttore con due etichette
 * ---------------------------------------------------------------------------
 * Cambiano cosa succede a **tutte** le spese di quel nome, e quanto lavoro
 * resta da fare:
 *
 *   Sempre cosi'  -> la categoria vale per tutte, passate e future, e di questo
 *                    esercente non si parla piu'.
 *   Cambiano      -> la categoria e' il punto di partenza — si applica lo
 *                    stesso, subito — ma ogni spesa resta da confermare. E' il
 *                    caso Euronics: lo stesso nome ospita un computer comprato
 *                    per lavorare e una sciocchezza.
 *
 * Per questo non c'e' un bottone «Salva» separato: **la risposta e' il
 * salvataggio**. Un salva in fondo obbligherebbe a scegliere due volte la
 * stessa cosa, e lascerebbe possibile lo stato «ho scelto e non ho salvato»,
 * che su una decisione binaria non vuol dire niente.
 */
export function DecidiEsercente({
  merchantId,
  esercente,
  categoriaId,
  categorie,
}: {
  merchantId: string;
  esercente: string;
  categoriaId: string | null;
  categorie: readonly { id: string; percorso: string }[];
}) {
  const router = useRouter();
  const [aperto, setAperto] = useState(false);
  const [cerca, setCerca] = useState('');
  const [scelto, setScelto] = useState<string>(categoriaId ?? '');
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const nome = categorie.find((c) => c.id === scelto)?.percorso ?? null;

  // Il filtro e' in memoria, non una query: le categorie arrivano gia' con la
  // pagina, e con trentacinque voci scrivere tre lettere e' sempre piu' veloce
  // che scorrere.
  const visibili =
    cerca.trim() === ''
      ? categorie
      : categorie.filter((c) => c.percorso.toLowerCase().includes(cerca.trim().toLowerCase()));

  async function decidi(variabile: boolean) {
    setInCorso(true);
    setErrore(null);
    try {
      const risposta = await fetch('/api/admin/esercenti', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: merchantId,
          categoria_id: scelto === '' ? null : scelto,
          variabile,
        }),
      });
      const esito = (await risposta.json()) as Record<string, unknown>;
      if (!risposta.ok) {
        setErrore(String(esito['error'] ?? risposta.status));
        return;
      }
      setAperto(false);
      // La categoria si e' appena propagata a tutte le sue spese: la lista che
      // si sta guardando e' di un istante fa.
      router.refresh();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : String(e));
    } finally {
      setInCorso(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAperto(true)}
        className="nota nota-avviso mt-3 flex min-h-11 w-full items-center gap-2 text-left text-[13px]"
      >
        <span className="flex-1">
          <strong>Nuovo esercente.</strong> Le spese di {esercente} sono sempre dello stesso tipo?
        </span>
        <span aria-hidden="true" className="shrink-0 text-testo-3">
          ›
        </span>
      </button>

      <Foglio
        aperto={aperto}
        titolo={esercente}
        nota="Vale per tutte le sue spese, anche quelle già registrate."
        onChiudi={() => {
          setAperto(false);
          setCerca('');
          setErrore(null);
          // Chiudere annulla: la scelta in sospeso non deve sopravvivere a una
          // finestra chiusa senza rispondere.
          setScelto(categoriaId ?? '');
        }}
      >
        <div className="space-y-3">
          {errore !== null && <p className="nota nota-errore text-[13px]">{errore}</p>}

          <input
            value={cerca}
            onChange={(e) => setCerca(e.target.value)}
            placeholder="cerca una categoria"
            className="min-h-11 w-full rounded-full bg-s3 px-4 text-[15px] placeholder:text-testo-3"
            disabled={inCorso}
          />

          <ul className="elenco max-h-[38vh] overflow-y-auto text-[15px]">
            <li>
              <button
                type="button"
                onClick={() => setScelto('')}
                className="flex min-h-11 w-full items-center gap-2 text-left"
              >
                <span className="flex-1 text-testo-2">— senza categoria —</span>
                {scelto === '' && <span aria-hidden="true">✓</span>}
              </button>
            </li>
            {visibili.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setScelto(c.id)}
                  className="flex min-h-11 w-full items-center gap-2 text-left"
                >
                  <span className="flex-1 truncate">{c.percorso}</span>
                  {scelto === c.id && <span aria-hidden="true">✓</span>}
                </button>
              </li>
            ))}
          </ul>

          {/* Le due risposte, e sono anche il salvataggio. Restano attaccate in
              fondo al foglio: con trentacinque categorie, dei bottoni in coda
              alla lista si raggiungono scorrendo, e a quel punto non si sa piu'
              cosa si e' scelto. */}
          <div className="sticky bottom-0 space-y-2 bg-s2 pt-3">
            <button
              type="button"
              onClick={() => void decidi(false)}
              disabled={inCorso}
              className="min-h-12 w-full rounded-full bg-accento px-4 text-[15px] font-semibold text-accento-testo disabled:opacity-40"
            >
              {inCorso ? '…' : 'Sempre così'}
            </button>
            <p className="px-1 text-[12px] text-testo-3">
              {nome === null
                ? `Tutte le spese di ${esercente} restano senza categoria, e non te lo chiedo più.`
                : `Tutte le spese di ${esercente} vanno in ${nome}, anche quelle già registrate.`}
            </p>

            <button
              type="button"
              onClick={() => void decidi(true)}
              disabled={inCorso}
              className="min-h-12 w-full rounded-full bg-s3 px-4 text-[15px] font-medium disabled:opacity-40"
            >
              {inCorso ? '…' : 'Cambiano, chiedimelo ogni volta'}
            </button>
            <p className="px-1 text-[12px] text-testo-3">
              {nome === null
                ? 'Ogni sua spesa resta da classificare una per una.'
                : `${nome} è il punto di partenza, ma ogni spesa resta da confermare.`}
            </p>
          </div>
        </div>
      </Foglio>
    </>
  );
}
