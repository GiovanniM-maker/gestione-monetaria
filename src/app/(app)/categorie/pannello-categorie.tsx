'use client';

import { useClassiSceglibili } from '../classi-note';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BOTTONE, BOTTONE_MINORE, CAMPO_PIENO } from '@/lib/ui/controlli';
import type { NodoAlbero } from '@/lib/tassonomia/categorie';
import { Foglio } from '../foglio';

/**
 * L'albero delle categorie: aggiungere e togliere.
 *
 * ---------------------------------------------------------------------------
 * Creare si fa da dove si guarda il ramo
 * ---------------------------------------------------------------------------
 * Il modulo per creare stava in cima, con un menu a tendina in cui scegliere il
 * genitore fra le sole radici. Due difetti, e il secondo si e' visto in uso:
 * per fare una sottocategoria di `Casa` bisognava **scorrere via da `Casa`**,
 * tornare in cima e ritrovarla in una tendina; e una sottocategoria di una
 * sottocategoria non era proprio possibile, perche' la tendina si fermava al
 * primo livello.
 *
 * Ora ogni riga dell'albero ha il suo **`+`**, che apre il foglio col genitore
 * gia' scelto e scritto in chiaro. Il bottone in cima fa la stessa cosa senza
 * genitore, cioe' crea una radice. E' lo stesso foglio: una forma sola, due
 * modi di aprirla, nessuna possibilita' che le due divergano.
 *
 * ---------------------------------------------------------------------------
 * Perche' l'eliminazione chiede una conferma e la creazione no
 * ---------------------------------------------------------------------------
 * Creare una categoria di troppo si vede e si toglie. Eliminarne una sposta
 * tutto il suo contenuto altrove, ed e' un'operazione che si giudica **prima**:
 * per questo la riga dice quanti esercenti e quanti movimenti ci sono appesi, e
 * dove finiranno. Un «sei sicuro?» senza quei numeri non e' una conferma, e'
 * un ostacolo.
 *
 * Il contenuto non si perde mai: `elimina_categoria` sposta esercenti,
 * movimenti e figlie sul genitore. Su una radice con del contenuto e senza
 * genitore si ferma e lo dice, invece di scollegare centinaia di movimenti in
 * silenzio — la spesa sparirebbe dall'albero pur restando nel totale, ed e' il
 * guasto che si scopre guardando un numero che non torna.
 */

/** `null` = nessun foglio aperto; `undefined` come genitore = una radice. */
type DaCreare = { padre: NodoAlbero | null } | null;

export function PannelloCategorie({ albero }: { albero: readonly NodoAlbero[] }) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [esito, setEsito] = useState<string | null>(null);

  const [daCreare, setDaCreare] = useState<DaCreare>(null);
  const [daEliminare, setDaEliminare] = useState<NodoAlbero | null>(null);
  const [spostaSu, setSpostaSu] = useState('');

  async function scrivi(metodo: string, corpo: unknown, dopo: () => void) {
    setInCorso(true);
    setErrore(null);
    setEsito(null);
    try {
      const risposta = await fetch('/api/admin/categorie', {
        method: metodo,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(corpo),
      });
      const risultato = (await risposta.json()) as Record<string, unknown>;
      if (!risposta.ok) {
        setErrore(String(risultato['error'] ?? risposta.status));
        return;
      }
      dopo();
      router.refresh();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : String(e));
    } finally {
      setInCorso(false);
    }
  }

  // Dove finisce il contenuto: il genitore, o la radice scelta se non ce n'e'
  // uno. La frase la costruisce la schermata dagli stessi dati che manda, cosi'
  // quello che si legge e quello che succede sono la stessa cosa.
  const destinazione =
    daEliminare === null
      ? null
      : daEliminare.parent_id !== null
        ? (albero.find((c) => c.id === daEliminare.parent_id)?.nome ?? 'il genitore')
        : spostaSu === ''
          ? null
          : (albero.find((c) => c.id === spostaSu)?.nome ?? null);

  // Conteggi ignoti: si esige comunque una destinazione. Nel dubbio si chiede,
  // invece di lasciar credere che non ci sia niente da spostare.
  const contenuto =
    daEliminare === null
      ? 0
      : daEliminare.esercenti === null || daEliminare.movimenti === null
        ? null
        : daEliminare.esercenti + daEliminare.movimenti;

  const serveDestinazione =
    daEliminare !== null && daEliminare.parent_id === null && contenuto !== 0;

  return (
    <div className="space-y-4">
      {errore !== null && <p className="nota nota-errore text-[14px]">{errore}</p>}
      {esito !== null && <p className="nota nota-esito text-[14px]">{esito}</p>}

      <button
        type="button"
        className={`${BOTTONE} w-full`}
        disabled={inCorso}
        onClick={() => setDaCreare({ padre: null })}
      >
        + Nuova categoria
      </button>

      <ul className="scheda elenco px-4">
        {albero.map((c) => (
          <li key={c.id}>
            <div
              className="flex items-center gap-1"
              style={{ paddingLeft: `${Math.min(c.profondita, 4) * 14}px` }}
            >
              <Link
                href={`/categoria/${c.id}`}
                className="flex min-h-12 min-w-0 flex-1 flex-col justify-center"
              >
                <span className="truncate text-[15px]">{c.nome}</span>
                <span className="truncate text-[12px] text-testo-3">
                  {c.esercenti === null || c.movimenti === null ? (
                    <span title="conteggi non disponibili">— · —</span>
                  ) : (
                    <>
                      {c.esercenti} {c.esercenti === 1 ? 'esercente' : 'esercenti'} · {c.movimenti}{' '}
                      {c.movimenti === 1 ? 'movimento' : 'movimenti'}
                    </>
                  )}
                  {c.discrezionalita_predefinita !== null &&
                    ` · di norma ${c.discrezionalita_predefinita}`}
                </span>
              </Link>

              {/* Aggiungere una figlia si fa qui, guardando il ramo: e' l'unico
                  posto in cui si sa gia' dove va. */}
              <button
                type="button"
                aria-label={`aggiungi una sottocategoria dentro ${c.nome}`}
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-[19px] text-testo-2"
                disabled={inCorso}
                onClick={() => setDaCreare({ padre: c })}
              >
                <span aria-hidden="true">+</span>
              </button>
              <button
                type="button"
                aria-label={`elimina ${c.nome}`}
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-[15px] text-testo-3"
                disabled={inCorso}
                onClick={() => {
                  setDaEliminare(c);
                  setSpostaSu('');
                  setErrore(null);
                }}
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>
          </li>
        ))}
      </ul>

      <Creazione
        stato={daCreare}
        occupato={inCorso}
        onChiudi={() => setDaCreare(null)}
        onCrea={(corpo, nome) =>
          void scrivi('POST', corpo, () => {
            setDaCreare(null);
            setEsito(`«${nome}» creata.`);
          })
        }
      />

      <Foglio
        aperto={daEliminare !== null}
        titolo={daEliminare === null ? '' : `Elimino «${daEliminare.nome}»?`}
        onChiudi={() => setDaEliminare(null)}
      >
        {daEliminare !== null && (
          <div className="space-y-3">
            <p className="text-[14px] text-testo-2">
              {contenuto === null ? (
                <>
                  <strong className="text-testo">Non so quanto contiene</strong> — i conteggi non
                  sono disponibili. Quello che c&rsquo;è verrà spostato dove indichi qui sotto.
                </>
              ) : (
                <>
                  Ci sono appesi <strong className="text-testo">{daEliminare.esercenti}</strong>{' '}
                  esercenti e <strong className="text-testo">{daEliminare.movimenti}</strong>{' '}
                  movimenti.{' '}
                  {contenuto === 0
                    ? 'Non si sposta niente.'
                    : destinazione !== null
                      ? `Passeranno a «${destinazione}», insieme alle eventuali sottocategorie.`
                      : 'È di primo livello e non ha un genitore: scegli dove spostarli.'}
                </>
              )}
            </p>

            {serveDestinazione && (
              <select
                value={spostaSu}
                onChange={(e) => setSpostaSu(e.target.value)}
                className={CAMPO_PIENO}
                disabled={inCorso}
              >
                <option value="">— dove sposto il contenuto? —</option>
                {albero
                  .filter(
                    (c) =>
                      c.id !== daEliminare.id &&
                      !c.percorso.startsWith(`${daEliminare.percorso} > `),
                  )
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.percorso}
                    </option>
                  ))}
              </select>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                className={`${BOTTONE} flex-1`}
                disabled={inCorso || (serveDestinazione && spostaSu === '')}
                onClick={() =>
                  void scrivi(
                    'DELETE',
                    { id: daEliminare.id, spostaSu: spostaSu === '' ? null : spostaSu },
                    () => {
                      setEsito(`«${daEliminare.nome}» eliminata.`);
                      setDaEliminare(null);
                    },
                  )
                }
              >
                Elimina
              </button>
              <button
                type="button"
                className={BOTTONE_MINORE}
                onClick={() => setDaEliminare(null)}
                disabled={inCorso}
              >
                Annulla
              </button>
            </div>
          </div>
        )}
      </Foglio>
    </div>
  );
}

/**
 * Il foglio che crea.
 *
 * Il genitore non e' un menu a tendina ma una **frase**: «dentro Casa», oppure
 * «di primo livello». Chi apre questo foglio ha appena toccato il `+` di una
 * riga o il bottone in cima, quindi sa gia' dove sta creando — la tendina
 * sarebbe un'occasione per cambiarlo per sbaglio, non un'informazione.
 */
function Creazione({
  stato,
  occupato,
  onChiudi,
  onCrea,
}: {
  stato: DaCreare;
  occupato: boolean;
  onChiudi: () => void;
  onCrea: (corpo: Record<string, unknown>, nome: string) => void;
}) {
  const classiSceglibili = useClassiSceglibili();
  const [nome, setNome] = useState('');
  const [discrezionalita, setDiscrezionalita] = useState('');
  const padre = stato?.padre ?? null;

  return (
    <Foglio
      aperto={stato !== null}
      titolo={padre === null ? 'Nuova categoria' : `Dentro «${padre.nome}»`}
      nota={
        padre === null
          ? 'Di primo livello: comparirà fra le radici dell’albero.'
          : `Il percorso sarà «${padre.percorso} > …».`
      }
      onChiudi={() => {
        setNome('');
        setDiscrezionalita('');
        onChiudi();
      }}
    >
      <div className="space-y-3">
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="nome della categoria"
          className={CAMPO_PIENO}
          disabled={occupato}
          autoFocus
        />
        <label className="block">
          <span className="text-[12px] text-testo-2">discrezionalità predefinita</span>
          <select
            value={discrezionalita}
            onChange={(e) => setDiscrezionalita(e.target.value)}
            className={CAMPO_PIENO}
            disabled={occupato}
          >
            <option value="">— nessuna —</option>
            {classiSceglibili.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
        <p className="text-[12px] text-testo-3">
          La discrezionalità predefinita si applica agli esercenti che finiranno qui e non hanno una
          scelta propria. Si può lasciare vuota e decidere caso per caso.
        </p>
        <button
          type="button"
          className={`${BOTTONE} w-full`}
          disabled={occupato || nome.trim() === ''}
          onClick={() => {
            const n = nome.trim();
            onCrea(
              {
                nome: n,
                padreId: padre?.id ?? null,
                discrezionalita: discrezionalita === '' ? null : discrezionalita,
              },
              n,
            );
            setNome('');
            setDiscrezionalita('');
          }}
        >
          Crea
        </button>
      </div>
    </Foglio>
  );
}
