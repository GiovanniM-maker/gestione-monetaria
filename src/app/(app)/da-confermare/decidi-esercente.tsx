'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Foglio } from '../foglio';
import { spiegaEccezione, spiegaRisposta, spiegaTesto, type Spiegazione } from '@/lib/ui/errori';
import { NotaErrore } from '@/lib/ui/nota-errore';
import { Icona } from '@/lib/ui/icone';

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
  const [errore, setErrore] = useState<Spiegazione | null>(null);

  const [creando, setCreando] = useState(false);
  const [nuova, setNuova] = useState('');
  const [dentro, setDentro] = useState('');
  /**
   * Le categorie create qui dentro, finche' la pagina non si ricostruisce.
   *
   * `categorie` arriva dal server insieme alla pagina, quindi una appena creata
   * non c'e'. Senza tenerle da parte, subito dopo averla creata la riga
   * sparirebbe dall'elenco e le due frasi sotto direbbero «senza categoria» —
   * cioe' il contrario di quello che e' appena successo. Un `router.refresh()`
   * qui non serve: chiuderebbe il foglio e butterebbe la scelta in sospeso.
   */
  const [aggiunte, setAggiunte] = useState<{ id: string; percorso: string }[]>([]);

  const tutte = [...categorie, ...aggiunte];
  const nome = tutte.find((c) => c.id === scelto)?.percorso ?? null;

  // Il filtro e' in memoria, non una query: le categorie arrivano gia' con la
  // pagina, e con trentacinque voci scrivere tre lettere e' sempre piu' veloce
  // che scorrere.
  const visibili =
    cerca.trim() === ''
      ? tutte
      : tutte.filter((c) => c.percorso.toLowerCase().includes(cerca.trim().toLowerCase()));

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
      if (!risposta.ok) {
        setErrore(await spiegaRisposta(risposta));
        return;
      }
      setAperto(false);
      // La categoria si e' appena propagata a tutte le sue spese: la lista che
      // si sta guardando e' di un istante fa.
      router.refresh();
    } catch (e) {
      setErrore(spiegaEccezione(e));
    } finally {
      setInCorso(false);
    }
  }

  /**
   * Crea una categoria e la **sceglie**, senza assegnarla a niente.
   *
   * E' la differenza con lo stesso gesto dentro il selettore di riga: li'
   * creare doveva essere seguito da un'assegnazione, qui la scrittura vera
   * arriva dopo, con «Sempre cosi'» o «Cambiano». Quindi questo bottone non
   * decide niente sull'esercente — mette solo la spunta su una categoria che
   * un attimo fa non esisteva.
   *
   * `crea_categoria` e' rieseguibile: stesso nome sotto lo stesso padre
   * restituisce quella che c'e' gia', e un tocco ripetuto non crea due
   * «Pizzerie».
   */
  async function creaEScegli() {
    const battuto = nuova.trim();
    if (battuto === '') return;
    setInCorso(true);
    setErrore(null);
    try {
      const risposta = await fetch('/api/admin/categorie', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nome: battuto, padreId: dentro === '' ? null : dentro }),
      });
      if (!risposta.ok) {
        setErrore(await spiegaRisposta(risposta));
        return;
      }
      const esito = (await risposta.json()) as Record<string, unknown>;
      const id = typeof esito['id'] === 'string' ? esito['id'] : null;
      if (id === null) {
        setErrore(
          spiegaTesto(
            'La categoria è stata creata ma non so quale sia.',
            'Chiudi e riaprilo: la troverai nell’elenco.',
          ),
        );
        return;
      }

      // Il percorso lo compone il client, e per un motivo solo: la route torna
      // l'identificativo e basta. E' un'etichetta che vive fino al prossimo
      // caricamento — poi arriva quella vera dal server, che e' la sola che
      // conta.
      const padre = tutte.find((c) => c.id === dentro)?.percorso ?? null;
      setAggiunte((a) => [
        ...a,
        { id, percorso: padre === null ? battuto : `${padre} > ${battuto}` },
      ]);
      setScelto(id);
      setCreando(false);
      setNuova('');
      setDentro('');
      setCerca('');
    } catch (e) {
      setErrore(spiegaEccezione(e));
    } finally {
      setInCorso(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAperto(true)}
        className="nota nota-avviso mt-3 flex min-h-11 w-full items-center gap-2 text-left text-sec"
      >
        <span className="flex-1">
          <strong>Nuovo esercente.</strong> Le spese di {esercente} sono sempre dello stesso tipo?
        </span>
        <Icona nome="chevron" misura={16} className="shrink-0 text-testo-3" />
      </button>

      <Foglio
        aperto={aperto}
        titolo={esercente}
        nota="Vale per tutte le sue spese, anche quelle già registrate."
        onChiudi={() => {
          setAperto(false);
          setCerca('');
          setErrore(null);
          setCreando(false);
          setNuova('');
          setDentro('');
          // Chiudere annulla: la scelta in sospeso non deve sopravvivere a una
          // finestra chiusa senza rispondere.
          setScelto(categoriaId ?? '');
        }}
      >
        <div className="space-y-3">
          <NotaErrore errore={errore} />

          {creando ? (
            /* Il modulo prende il posto dell'elenco invece di aprirsi sotto: su
               un telefono, sotto trentacinque righe, i suoi campi finirebbero
               fuori schermo — e si starebbe scrivendo un nome senza vedere il
               bottone che lo crea. */
            <div className="space-y-3">
              <input
                value={nuova}
                onChange={(e) => setNuova(e.target.value)}
                placeholder="nome della categoria"
                className="min-h-11 w-full rounded-full bg-s3 px-4 text-corpo placeholder:text-testo-3"
                disabled={inCorso}
                // Niente `autoFocus`: dentro un foglio apre la tastiera **prima**
                // che si sia visto cosa c'e' dentro, e su uno schermo stretto la
                // tastiera copre meta' del pannello. Il campo e' il primo
                // elemento: chi vuole scrivere lo tocca, e chi voleva solo
                // guardare l'elenco lo vede.
              />
              <label className="block">
                <span className="text-min text-testo-2">dove</span>
                <select
                  value={dentro}
                  onChange={(e) => setDentro(e.target.value)}
                  className="min-h-11 w-full rounded-full bg-s3 px-3.5 text-corpo"
                  disabled={inCorso}
                >
                  <option value="">di primo livello</option>
                  {tutte.map((c) => (
                    <option key={c.id} value={c.id}>
                      dentro {c.percorso}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-min text-testo-3">
                Appena creata viene <strong>scelta</strong> qui. Sull&rsquo;esercente non cambia
                ancora niente: decide una delle due risposte qui sotto. Se esiste gi&agrave; con lo
                stesso nome nello stesso posto, si usa quella.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void creaEScegli()}
                  disabled={inCorso || nuova.trim() === ''}
                  className="min-h-11 flex-1 rounded-full bg-accento text-corpo font-semibold text-accento-testo disabled:opacity-40"
                >
                  {inCorso ? '…' : 'Crea e scegli'}
                </button>
                <button
                  type="button"
                  onClick={() => setCreando(false)}
                  disabled={inCorso}
                  className="min-h-11 rounded-full bg-s3 px-4 text-sec font-medium"
                >
                  Annulla
                </button>
              </div>
            </div>
          ) : (
            <>
              <input
                value={cerca}
                onChange={(e) => setCerca(e.target.value)}
                placeholder="cerca una categoria"
                className="min-h-11 w-full rounded-full bg-s3 px-4 text-corpo placeholder:text-testo-3"
                disabled={inCorso}
              />

              <ul className="elenco max-h-[38vh] overflow-y-auto text-corpo">
                {/* In cima e non in fondo: il posto in cui ci si accorge che una
                categoria manca e' mentre la si cerca, non dopo aver scorso
                tutte le altre. Diventa «Crea "pizzeria"» se si e' gia' scritto
                qualcosa, cosi' il nome non si ribatte. */}
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setNuova(cerca.trim());
                      setCreando(true);
                    }}
                    className="flex min-h-11 w-full items-center gap-2 text-left text-accento"
                  >
                    {cerca.trim() === '' ? '+ Nuova categoria' : `+ Crea «${cerca.trim()}»`}
                  </button>
                </li>
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
            </>
          )}

          {/* Le due risposte, e sono anche il salvataggio. Restano attaccate in
              fondo al foglio: con trentacinque categorie, dei bottoni in coda
              alla lista si raggiungono scorrendo, e a quel punto non si sa piu'
              cosa si e' scelto. */}
          <div className={`sticky bottom-0 space-y-2 bg-s2 pt-3 ${creando ? 'hidden' : ''}`}>
            <button
              type="button"
              onClick={() => void decidi(false)}
              disabled={inCorso}
              className="min-h-12 w-full rounded-full bg-accento px-4 text-corpo font-semibold text-accento-testo disabled:opacity-40"
            >
              {inCorso ? '…' : 'Sempre così'}
            </button>
            <p className="px-1 text-min text-testo-3">
              {nome === null
                ? `Tutte le spese di ${esercente} restano senza categoria, e non te lo chiedo più.`
                : `Tutte le spese di ${esercente} vanno in ${nome}, anche quelle già registrate.`}
            </p>

            <button
              type="button"
              onClick={() => void decidi(true)}
              disabled={inCorso}
              className="min-h-12 w-full rounded-full bg-s3 px-4 text-corpo font-medium disabled:opacity-40"
            >
              {inCorso ? '…' : 'Cambiano, chiedimelo ogni volta'}
            </button>
            <p className="px-1 text-min text-testo-3">
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
