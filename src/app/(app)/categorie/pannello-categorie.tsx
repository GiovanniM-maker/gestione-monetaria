'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BOTTONE, BOTTONE_MINORE, CAMPO_PIENO } from '@/lib/ui/controlli';
import type { NodoAlbero } from '@/lib/tassonomia/categorie';

/**
 * L'albero delle categorie: aggiungere e togliere.
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
 * ---------------------------------------------------------------------------
 * Il contenuto non si perde mai
 * ---------------------------------------------------------------------------
 * `elimina_categoria` sposta esercenti, movimenti e figlie sul genitore. Su una
 * radice con del contenuto e senza genitore si ferma e lo dice, invece di
 * scollegare centinaia di movimenti in silenzio — la spesa sparirebbe
 * dall'albero pur restando nel totale, ed e' il guasto che si scopre guardando
 * un numero che non torna.
 */

const DISCREZIONALITA = ['essenziale', 'investimento', 'utile', 'voluttuario'] as const;

export function PannelloCategorie({ albero }: { albero: readonly NodoAlbero[] }) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const [nome, setNome] = useState('');
  const [padre, setPadre] = useState('');
  const [discrezionalita, setDiscrezionalita] = useState('');
  const [daEliminare, setDaEliminare] = useState<NodoAlbero | null>(null);
  const [spostaSu, setSpostaSu] = useState('');

  const radici = albero.filter((c) => c.parent_id === null);

  async function scrivi(metodo: string, corpo: unknown, dopo: () => void) {
    setInCorso(true);
    setErrore(null);
    try {
      const risposta = await fetch('/api/admin/categorie', {
        method: metodo,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(corpo),
      });
      const esito = (await risposta.json()) as Record<string, unknown>;
      if (!risposta.ok) {
        setErrore(String(esito['error'] ?? risposta.status));
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
    <div className="space-y-6">
      <section className="space-y-3 scheda p-3">
        <h2 className="text-sm font-medium">Aggiungi una categoria</h2>
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="nome della categoria"
          className={CAMPO_PIENO}
          disabled={inCorso}
        />
        <select
          value={padre}
          onChange={(e) => setPadre(e.target.value)}
          className={CAMPO_PIENO}
          disabled={inCorso}
        >
          <option value="">— di primo livello, senza genitore —</option>
          {radici.map((c) => (
            <option key={c.id} value={c.id}>
              dentro {c.nome}
            </option>
          ))}
        </select>
        <select
          value={discrezionalita}
          onChange={(e) => setDiscrezionalita(e.target.value)}
          className={CAMPO_PIENO}
          disabled={inCorso}
        >
          <option value="">— senza discrezionalità predefinita —</option>
          {DISCREZIONALITA.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <p className="text-xs text-testo-2">
          Il genitore elenca solo le categorie di primo livello: due livelli bastano a ritrovarsi, e
          un terzo si aggiunge spostando dalla scheda della categoria quando serve davvero.
        </p>
        <button
          type="button"
          className={BOTTONE}
          disabled={inCorso || nome.trim() === ''}
          onClick={() =>
            void scrivi(
              'POST',
              {
                nome: nome.trim(),
                padreId: padre === '' ? null : padre,
                discrezionalita: discrezionalita === '' ? null : discrezionalita,
              },
              () => {
                setNome('');
                setDiscrezionalita('');
              },
            )
          }
        >
          Crea
        </button>
      </section>

      {errore !== null && <p className="nota nota-errore text-[14px]">{errore}</p>}

      <section className="space-y-1">
        <h2 className="font-medium">L&rsquo;albero</h2>
        <ul className="divide-y divide-filo">
          {albero.map((c) => (
            <li key={c.id} className="py-1">
              <div
                className="flex items-center justify-between gap-2"
                style={{ paddingLeft: `${Math.min(c.profondita, 4) * 12}px` }}
              >
                <Link href={`/categoria/${c.id}`} className="min-w-0 flex-1 py-2">
                  <span className="block truncate text-sm">{c.nome}</span>
                  <span className="block text-xs text-testo-2">
                    {c.esercenti === null || c.movimenti === null ? (
                      <span title="conteggi non disponibili">— · —</span>
                    ) : (
                      <>
                        {c.esercenti} {c.esercenti === 1 ? 'esercente' : 'esercenti'} ·{' '}
                        {c.movimenti} {c.movimenti === 1 ? 'movimento' : 'movimenti'}
                      </>
                    )}
                    {c.discrezionalita_predefinita !== null &&
                      ` · di norma ${c.discrezionalita_predefinita}`}
                  </span>
                </Link>
                <button
                  type="button"
                  className={BOTTONE_MINORE}
                  disabled={inCorso}
                  onClick={() => {
                    setDaEliminare(c);
                    setSpostaSu('');
                    setErrore(null);
                  }}
                >
                  elimina
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {daEliminare !== null && (
        <section className="space-y-3 nota nota-errore">
          <h2 className="text-sm font-medium">Elimino «{daEliminare.nome}»?</h2>
          <p className="text-xs text-testo-2 text-testo-3">
            {contenuto === null ? (
              <>
                <strong>Non so quanto contiene</strong> — i conteggi non sono disponibili. Quello
                che c&rsquo;è verrà spostato dove indichi qui sotto.
              </>
            ) : (
              <>
                Ci sono appesi <strong>{daEliminare.esercenti}</strong> esercenti e{' '}
                <strong>{daEliminare.movimenti}</strong> movimenti.{' '}
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
                    c.id !== daEliminare.id && !c.percorso.startsWith(`${daEliminare.percorso} > `),
                )
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.percorso}
                  </option>
                ))}
            </select>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={BOTTONE}
              disabled={inCorso || (serveDestinazione && spostaSu === '')}
              onClick={() =>
                void scrivi(
                  'DELETE',
                  { id: daEliminare.id, spostaSu: spostaSu === '' ? null : spostaSu },
                  () => setDaEliminare(null),
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
        </section>
      )}
    </div>
  );
}
