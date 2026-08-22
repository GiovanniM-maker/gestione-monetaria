'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BOTTONE,
  BOTTONE_MINORE,
  CAMPO_PIENO,
  CASELLA,
  ETICHETTA_CASELLA,
} from '@/lib/ui/controlli';
import { COLORI_CLASSE, type DiscretionClassRow } from '@/lib/db/types';
import { TAVOLOZZA_CLASSI } from '../grafici';
import { Foglio } from '../foglio';
import { spiegaEccezione, spiegaErrore, type Spiegazione } from '@/lib/ui/errori';
import { NotaErrore } from '@/lib/ui/nota-errore';

/**
 * Le classi di discrezionalita': crearle, correggerle, eliminarle.
 *
 * ---------------------------------------------------------------------------
 * Perche' questa schermata sta nel menu e non fra le quattro schede
 * ---------------------------------------------------------------------------
 * Le quattro schede in basso sono le domande che si fanno all'app. Questa non
 * e' una domanda: e' **manutenzione**, come le categorie e gli esercenti, e si
 * apre due volte l'anno. Le due navigazioni non hanno nessuna voce in comune,
 * di proposito.
 *
 * ---------------------------------------------------------------------------
 * L'interruttore che conta e' «nel totale»
 * ---------------------------------------------------------------------------
 * Non toglie niente da nessuna parte: la classe resta nella ripartizione, con
 * il suo colore e il suo subtotale, e smette solo di essere **sommata** nel
 * numero in cima. Serve per il ricorrente che non si vuole togliere — un
 * risparmio, le tasse, una rata — e senza di lui il totale mescolerebbe
 * «quanto potrei smettere di pagare» con «quanto continuero' a pagare
 * comunque».
 *
 * Ogni riga lo dice a parole sotto il nome, perche' un interruttore che decide
 * la composizione della metrica principale non puo' essere una casella muta.
 *
 * ---------------------------------------------------------------------------
 * Eliminare chiede dove vanno le righe, e non e' burocrazia
 * ---------------------------------------------------------------------------
 * Senza destinazione l'unica alternativa sarebbe metterle a `null`, cioe'
 * spostare della spesa classificata dentro «non classificato» in silenzio. Chi
 * sposta dei soldi da una classe all'altra deve nominare l'altra — ed e' anche
 * il modo di **unire** due classi, che infatti non ha un bottone suo.
 *
 * Lo spostamento tocca anche le righe corrette a mano: la classe che avevano
 * non esiste piu', e non c'e' alternativa onesta. La conferma lo dice.
 *
 * Chi vuole solo smettere di usarne una **archivia**: sparisce dai selettori e
 * lo storico non si tocca.
 */

type Modulo = { slug: string | null } | null;

export function PannelloClassi({ classi }: { classi: readonly DiscretionClassRow[] }) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<Spiegazione | null>(null);
  const [esito, setEsito] = useState<string | null>(null);

  const [modulo, setModulo] = useState<Modulo>(null);
  const [daEliminare, setDaEliminare] = useState<DiscretionClassRow | null>(null);
  const [verso, setVerso] = useState('');

  const [nome, setNome] = useState('');
  const [descrizione, setDescrizione] = useState('');
  const [colore, setColore] = useState<string>('blu');
  const [nelRicorrente, setNelRicorrente] = useState(true);

  async function scrivi(metodo: string, corpo: unknown, dopo: () => void) {
    setInCorso(true);
    setErrore(null);
    setEsito(null);
    try {
      const risposta = await fetch('/api/admin/classi', {
        method: metodo,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(corpo),
      });
      const risultato = (await risposta.json()) as Record<string, unknown>;
      if (!risposta.ok) {
        setErrore(spiegaErrore(risposta.status, risultato));
        return;
      }
      dopo();
      router.refresh();
    } catch (e) {
      setErrore(spiegaEccezione(e));
    } finally {
      setInCorso(false);
    }
  }

  function apri(c: DiscretionClassRow | null) {
    setNome(c?.nome ?? '');
    setDescrizione(c?.descrizione ?? '');
    setColore(c?.colore ?? primoLibero(classi));
    setNelRicorrente(c?.nel_ricorrente ?? true);
    setModulo({ slug: c?.slug ?? null });
  }

  const inModifica = modulo !== null && modulo.slug !== null;

  return (
    <div className="space-y-4">
      <NotaErrore errore={errore} />
      {esito !== null && <p className="nota nota-esito text-sec">{esito}</p>}

      <button type="button" className={BOTTONE} onClick={() => apri(null)} disabled={inCorso}>
        + Nuova classe
      </button>

      <div className="scheda px-4">
        <ul className="elenco">
          {classi.map((c) => (
            <li key={c.slug} className="py-2">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="size-3 shrink-0 rounded-full"
                  style={{ background: TAVOLOZZA_CLASSI[c.colore] ?? 'var(--neutro)' }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-corpo">
                    {c.nome}
                    {c.is_archived && (
                      <span className="ml-2 text-min text-testo-3">archiviata</span>
                    )}
                  </span>
                  <span className="block truncate text-min text-testo-3">
                    {c.nel_ricorrente ? 'nel totale del ricorrente' : 'fuori dal totale'}
                    {c.descrizione !== null && ` · ${c.descrizione}`}
                  </span>
                </span>
                <button
                  type="button"
                  className={BOTTONE_MINORE}
                  onClick={() => apri(c)}
                  disabled={inCorso}
                >
                  Modifica
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Il foglio: crea e corregge, con la stessa forma                     */}
      {/* ------------------------------------------------------------------ */}
      <Foglio
        aperto={modulo !== null}
        titolo={inModifica ? 'Correggi la classe' : 'Nuova classe'}
        onChiudi={() => setModulo(null)}
      >
        <div className="space-y-4 p-4">
          <label className="block">
            <span className="text-min text-testo-2">nome</span>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className={CAMPO_PIENO}
              placeholder="Risparmio"
              disabled={inCorso}
            />
          </label>

          <label className="block">
            <span className="text-min text-testo-2">cosa ci va dentro</span>
            <input
              value={descrizione}
              onChange={(e) => setDescrizione(e.target.value)}
              className={CAMPO_PIENO}
              placeholder="Soldi messi da parte: non è spesa, non si taglia."
              disabled={inCorso}
            />
            {/* Non e' decorazione: la legge il modello prima di proporre una
                classificazione, e la Fase 4 ha misurato che quando gli manca
                un'informazione se la inventa plausibile. */}
            <span className="mt-1 block text-min text-testo-3">
              La legge anche il modello quando propone una classificazione.
            </span>
          </label>

          <div>
            <span className="text-min text-testo-2">colore</span>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {COLORI_CLASSE.map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-label={k}
                  aria-pressed={colore === k}
                  onClick={() => setColore(k)}
                  disabled={inCorso}
                  className="size-11 rounded-controllo"
                  style={{
                    background: TAVOLOZZA_CLASSI[k],
                    outline: colore === k ? '2px solid var(--accento)' : 'none',
                    outlineOffset: '2px',
                  }}
                />
              ))}
            </div>
          </div>

          <label className={ETICHETTA_CASELLA}>
            <input
              type="checkbox"
              className={CASELLA}
              checked={nelRicorrente}
              onChange={(e) => setNelRicorrente(e.target.checked)}
              disabled={inCorso}
            />
            <span>
              Entra nel totale del costo ricorrente
              <span className="mt-0.5 block text-min text-testo-3">
                Toglilo per una spesa che si ripete ma che non vuoi togliere — risparmio, tasse, una
                rata. Resta nella ripartizione con il suo numero, ma fuori dalla somma in cima.
              </span>
            </span>
          </label>

          <div className="flex gap-2">
            <button
              type="button"
              className={`${BOTTONE} flex-1`}
              disabled={inCorso || nome.trim() === ''}
              onClick={() => {
                const slug = modulo?.slug ?? null;
                void (slug === null
                  ? scrivi(
                      'POST',
                      {
                        nome,
                        descrizione: descrizione.trim() === '' ? null : descrizione,
                        colore,
                        nelRicorrente,
                      },
                      () => {
                        setModulo(null);
                        setEsito(`Classe «${nome.trim()}» creata.`);
                      },
                    )
                  : scrivi(
                      'PATCH',
                      {
                        slug,
                        nome,
                        descrizione: descrizione.trim() === '' ? null : descrizione,
                        colore,
                        nelRicorrente,
                      },
                      () => {
                        setModulo(null);
                        setEsito(`Classe «${nome.trim()}» aggiornata.`);
                      },
                    ));
              }}
            >
              {inCorso ? '…' : inModifica ? 'Salva' : 'Crea'}
            </button>
            <button
              type="button"
              className={BOTTONE_MINORE}
              onClick={() => setModulo(null)}
              disabled={inCorso}
            >
              Annulla
            </button>
          </div>

          {inModifica && (
            <div className="space-y-2 border-t border-filo pt-4">
              {/* Archiviare prima di eliminare, e in quest'ordine: e' quasi
                  sempre quello che si vuole davvero, e non riscrive niente. */}
              <button
                type="button"
                className={`${BOTTONE_MINORE} w-full`}
                disabled={inCorso}
                onClick={() => {
                  const c = classi.find((x) => x.slug === modulo?.slug);
                  if (c === undefined) return;
                  void scrivi('PATCH', { slug: c.slug, archiviata: !c.is_archived }, () => {
                    setModulo(null);
                    setEsito(
                      c.is_archived
                        ? `«${c.nome}» torna fra quelle scegliibili.`
                        : `«${c.nome}» archiviata: sparisce dai selettori, lo storico resta.`,
                    );
                  });
                }}
              >
                {classi.find((x) => x.slug === modulo?.slug)?.is_archived
                  ? 'Riportala in uso'
                  : 'Archiviala'}
              </button>
              <button
                type="button"
                className={`${BOTTONE_MINORE} w-full text-allarme`}
                disabled={inCorso}
                onClick={() => {
                  const c = classi.find((x) => x.slug === modulo?.slug);
                  if (c === undefined) return;
                  setVerso('');
                  setModulo(null);
                  setDaEliminare(c);
                }}
              >
                Eliminala
              </button>
            </div>
          )}
        </div>
      </Foglio>

      {/* ------------------------------------------------------------------ */}
      {/* Eliminare: la destinazione, e cosa succede davvero                  */}
      {/* ------------------------------------------------------------------ */}
      <Foglio
        aperto={daEliminare !== null}
        titolo={`Elimina «${daEliminare?.nome ?? ''}»`}
        onChiudi={() => setDaEliminare(null)}
      >
        <div className="space-y-4 p-4">
          <p className="text-sec text-testo-2">
            Movimenti, esercenti e categorie che usavano questa classe passano a quella che scegli.
            Comprese le righe corrette a mano: la classe che avevano non esisterà più.
          </p>

          <label className="block">
            <span className="text-min text-testo-2">spostale in</span>
            <select
              value={verso}
              onChange={(e) => setVerso(e.target.value)}
              className={CAMPO_PIENO}
              disabled={inCorso}
            >
              <option value="">— nessuna: elimina solo se non è in uso —</option>
              {classi
                .filter((c) => c.slug !== daEliminare?.slug)
                .map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.nome}
                  </option>
                ))}
            </select>
          </label>

          <p className="text-min text-testo-3">
            Se lasci vuoto e la classe è ancora in uso, l’operazione si ferma senza toccare niente.
            Per smettere di usarla senza riscrivere nessuna riga, <strong>archiviala</strong>.
          </p>

          <div className="flex gap-2">
            <button
              type="button"
              className={`${BOTTONE} flex-1`}
              disabled={inCorso}
              onClick={() => {
                const c = daEliminare;
                if (c === null) return;
                void scrivi('DELETE', { slug: c.slug, verso: verso === '' ? null : verso }, () => {
                  setDaEliminare(null);
                  setEsito(`Classe «${c.nome}» eliminata.`);
                });
              }}
            >
              {inCorso ? '…' : 'Elimina'}
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
      </Foglio>
    </div>
  );
}

/**
 * Il primo colore libero della tavolozza.
 *
 * Lo stesso criterio di `crea_classe` in SQL, e non e' un doppione che
 * diverge: qui serve solo a **preselezionare** il pallino nel foglio, cosi'
 * quello acceso e' quello che verrebbe assegnato. Chi decide resta la
 * funzione, che riceve il colore scelto.
 */
function primoLibero(classi: readonly DiscretionClassRow[]): string {
  const usati = new Set(classi.map((c) => c.colore));
  return COLORI_CLASSE.find((k) => !usati.has(k)) ?? 'blu';
}
