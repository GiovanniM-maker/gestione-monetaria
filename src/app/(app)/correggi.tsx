'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BOTTONE, BOTTONE_MINORE, CAMPO_PIENO } from '@/lib/ui/controlli';

/**
 * La correzione, dove si guarda il numero.
 *
 * Le tre scritture esistevano gia', ma vivevano in tre schermate diverse —
 * `/da-confermare`, `/revisione`, `/movimenti/[id]` — e trovarle era un
 * rompicapo. Peggio: `/da-confermare` mostra solo cio' che non e' ancora stato
 * confermato, quindi una riga vista e approvata ieri non era piu' correggibile
 * da nessuna parte se non riaprendola a mano.
 *
 * ---------------------------------------------------------------------------
 * La portata sta scritta sopra, sempre
 * ---------------------------------------------------------------------------
 * Sono tre operazioni **diverse**, non la stessa con un parametro:
 *
 * | Dove      | Cosa cambia                              | Fin dove arriva                    |
 * | --------- | ---------------------------------------- | ---------------------------------- |
 * | Movimento | discrezionalita', contesto, nota          | solo questa riga, per sempre       |
 * | Esercente | categoria, discrezionalita', abbonamento | tutte le sue spese, anche passate  |
 * | Categoria | nome, genitore, discrezionalita' di base | la tassonomia                      |
 *
 * Chi corregge deve saperlo **prima** di toccare: correggere una riga per
 * sbaglio su tutte le occorrenze di un esercente e' un danno che si scopre
 * settimane dopo, guardando un totale che non torna.
 */

const DISCREZIONALITA = ['essenziale', 'investimento', 'utile', 'voluttuario'] as const;
const CONTESTI = ['personale', 'business'] as const;

/* -------------------------------------------------------------------------- */
/* Il guscio comune                                                            */
/* -------------------------------------------------------------------------- */

function useScrittura(chiudi: () => void) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function scrivi(url: string, metodo: string, corpo: unknown): Promise<void> {
    setInCorso(true);
    setErrore(null);
    try {
      const risposta = await fetch(url, {
        method: metodo,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(corpo),
      });
      const esito = (await risposta.json()) as Record<string, unknown>;
      if (!risposta.ok) {
        setErrore(String(esito['error'] ?? risposta.status));
        return;
      }
      chiudi();
      router.refresh();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : String(e));
    } finally {
      setInCorso(false);
    }
  }

  return { inCorso, errore, scrivi };
}

function Pannello({
  titolo,
  portata,
  aperto,
  apri,
  chiudi,
  errore,
  children,
}: {
  titolo: string;
  portata: React.ReactNode;
  aperto: boolean;
  apri: () => void;
  chiudi: () => void;
  errore: string | null;
  children: React.ReactNode;
}) {
  if (!aperto) {
    return (
      <button type="button" className={BOTTONE_MINORE} onClick={apri}>
        {titolo}
      </button>
    );
  }

  return (
    <section className="space-y-3 scheda p-3">
      <h2 className="text-sm font-medium">{titolo}</h2>
      <p className="text-xs text-testo-2">{portata}</p>
      {children}
      {errore !== null && <p className="nota nota-errore text-[14px]">{errore}</p>}
      <button type="button" className={BOTTONE_MINORE} onClick={chiudi}>
        Annulla
      </button>
    </section>
  );
}

function Scelta({
  valore,
  cambia,
  vuoto,
  opzioni,
  disabilitato,
}: {
  valore: string;
  cambia: (v: string) => void;
  vuoto: string;
  opzioni: readonly { id: string; testo: string }[];
  disabilitato: boolean;
}) {
  return (
    <select
      value={valore}
      onChange={(e) => cambia(e.target.value)}
      className={CAMPO_PIENO}
      disabled={disabilitato}
    >
      <option value="">{vuoto}</option>
      {opzioni.map((o) => (
        <option key={o.id} value={o.id}>
          {o.testo}
        </option>
      ))}
    </select>
  );
}

const comeOpzioni = (valori: readonly string[]) => valori.map((v) => ({ id: v, testo: v }));

/* -------------------------------------------------------------------------- */
/* Movimento — solo questa riga                                                */
/* -------------------------------------------------------------------------- */

/**
 * Marca `manually_categorized`, quindi da qui in poi nessun automatismo tocca
 * piu' la riga. E' il patto delle regole di correttezza — «le correzioni
 * manuali dell'utente sono sacre» — e per questo si scrive **solo** se
 * qualcosa e' davvero cambiato: aprire il pannello e richiuderlo non deve
 * incidere niente.
 */
export function CorreggiMovimento({
  id,
  categoriaId,
  discrezionalita,
  contesto,
  note,
  variabile,
  categorie,
}: {
  id: string;
  categoriaId: string | null;
  discrezionalita: string | null;
  contesto: string | null;
  note: string | null;
  /** Se l'esercente e' dichiarato variabile, qui si cambia anche la categoria. */
  variabile: boolean;
  categorie: readonly { id: string; percorso: string }[];
}) {
  const [aperto, setAperto] = useState(false);
  const { inCorso, errore, scrivi } = useScrittura(() => setAperto(false));

  const [cat, setCat] = useState(categoriaId ?? '');
  const [d, setD] = useState(discrezionalita ?? '');
  const [c, setC] = useState(contesto ?? '');
  const [n, setN] = useState(note ?? '');

  const cambiato =
    (variabile && cat !== (categoriaId ?? '')) ||
    d !== (discrezionalita ?? '') ||
    c !== (contesto ?? '') ||
    n.trim() !== (note ?? '').trim();

  return (
    <Pannello
      titolo="Correggi questo movimento"
      portata={
        <>
          Vale <strong>solo per questa riga</strong>, e per sempre: da qui in poi nessun automatismo
          la tocca più, nemmeno se la classificazione dell’esercente cambia. È il caso del computer
          comprato da un negozio dove di solito si comprano sciocchezze.
        </>
      }
      aperto={aperto}
      apri={() => setAperto(true)}
      chiudi={() => setAperto(false)}
      errore={errore}
    >
      {/* La categoria per riga compare **solo** sugli esercenti variabili. Su un
          esercente fisso cambiarla qui sarebbe una scelta che vale una volta e
          si dimentica: la sua sede giusta e' la scheda dell'esercente, dove
          vale per tutte le sue spese. */}
      {variabile ? (
        <Scelta
          valore={cat}
          cambia={setCat}
          vuoto="— senza categoria —"
          opzioni={categorie.map((x) => ({ id: x.id, testo: x.percorso }))}
          disabilitato={inCorso}
        />
      ) : (
        <p className="text-xs text-testo-2">
          La <strong>categoria</strong> qui non si cambia: questo esercente è dichiarato{' '}
          <em>fisso</em>, quindi la sua categoria vale per tutte le sue spese. Per farla decidere
          riga per riga, marcalo <em>variabile</em> dalla sua scheda.
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <Scelta
          valore={d}
          cambia={setD}
          vuoto="— discrezionalità —"
          opzioni={comeOpzioni(DISCREZIONALITA)}
          disabilitato={inCorso}
        />
        <Scelta
          valore={c}
          cambia={setC}
          vuoto="— contesto —"
          opzioni={comeOpzioni(CONTESTI)}
          disabilitato={inCorso}
        />
      </div>
      <input
        value={n}
        onChange={(e) => setN(e.target.value)}
        placeholder="una nota, per ricordarsi perché"
        className={CAMPO_PIENO}
        disabled={inCorso}
      />
      <button
        type="button"
        className={BOTTONE}
        disabled={inCorso || !cambiato}
        onClick={() =>
          void scrivi('/api/admin/movimenti/classifica', 'POST', {
            id,
            categoriaId: variabile && cat !== '' ? cat : null,
            discrezionalita: d === '' ? null : d,
            contesto: c === '' ? null : c,
            note: n.trim() === '' ? null : n.trim(),
          })
        }
      >
        Applica a questa riga
      </button>
      {!cambiato && (
        <p className="text-xs text-testo-2">
          Niente da applicare: finché non cambi qualcosa la riga non viene marcata come corretta a
          mano.
        </p>
      )}
    </Pannello>
  );
}

/* -------------------------------------------------------------------------- */
/* Esercente — tutte le sue spese                                              */
/* -------------------------------------------------------------------------- */

export function CorreggiEsercente({
  id,
  categoryId,
  discrezionalita,
  contesto,
  abbonamento,
  categorie,
}: {
  id: string;
  categoryId: string | null;
  discrezionalita: string | null;
  contesto: string | null;
  abbonamento: boolean;
  categorie: readonly { id: string; percorso: string }[];
}) {
  const [aperto, setAperto] = useState(false);
  const { inCorso, errore, scrivi } = useScrittura(() => setAperto(false));

  const [cat, setCat] = useState(categoryId ?? '');
  const [d, setD] = useState(discrezionalita ?? '');
  const [c, setC] = useState(contesto ?? '');
  const [abb, setAbb] = useState(abbonamento);

  return (
    <Pannello
      titolo="Cambia la classificazione dell’esercente"
      portata={
        <>
          Vale per <strong>tutte le sue spese</strong>, passate e future — anche quelle già contate
          nei mesi chiusi, che cambieranno di conseguenza. Le righe corrette a mano una per una
          restano com’erano: quelle sono decisioni prese, e l’automatismo non le tocca.
        </>
      }
      aperto={aperto}
      apri={() => setAperto(true)}
      chiudi={() => setAperto(false)}
      errore={errore}
    >
      <Scelta
        valore={cat}
        cambia={setCat}
        vuoto="— senza categoria —"
        opzioni={categorie.map((x) => ({ id: x.id, testo: x.percorso }))}
        disabilitato={inCorso}
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <Scelta
          valore={d}
          cambia={setD}
          vuoto="— discrezionalità —"
          opzioni={comeOpzioni(DISCREZIONALITA)}
          disabilitato={inCorso}
        />
        <Scelta
          valore={c}
          cambia={setC}
          vuoto="— contesto —"
          opzioni={comeOpzioni(CONTESTI)}
          disabilitato={inCorso}
        />
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={abb}
          onChange={(e) => setAbb(e.target.checked)}
          disabled={inCorso}
          className="size-5"
        />
        è un abbonamento che si può disdire
      </label>
      <p className="text-xs text-testo-2">
        Il segno di spunta decide da che parte finisce nella metrica: gli abbonamenti si disdicono e
        il risparmio è certo, le abitudini si cambiano. Non si sommano mai, perché suggeriscono due
        azioni diverse.
      </p>
      <button
        type="button"
        className={BOTTONE}
        disabled={inCorso}
        onClick={() =>
          void scrivi('/api/admin/tassonomia', 'PATCH', {
            id,
            category_id: cat === '' ? null : cat,
            discretion: d === '' ? null : d,
            context: c === '' ? null : c,
            is_subscription: abb,
          })
        }
      >
        Applica a tutte le sue spese
      </button>
    </Pannello>
  );
}

/* -------------------------------------------------------------------------- */
/* Categoria — la tassonomia                                                   */
/* -------------------------------------------------------------------------- */

export function CorreggiCategoria({
  id,
  nome,
  discrezionalitaPredefinita,
  parentId,
  genitoriPossibili,
}: {
  id: string;
  nome: string;
  discrezionalitaPredefinita: string | null;
  parentId: string | null;
  genitoriPossibili: readonly { id: string; percorso: string }[];
}) {
  const [aperto, setAperto] = useState(false);
  const { inCorso, errore, scrivi } = useScrittura(() => setAperto(false));

  const [n, setN] = useState(nome);
  const [d, setD] = useState(discrezionalitaPredefinita ?? '');
  const [padre, setPadre] = useState(parentId ?? '');

  return (
    <Pannello
      titolo="Correggi la categoria"
      portata={
        <>
          Cambia <strong>la tassonomia</strong>: il nome compare ovunque, e spostare il genitore
          rifà i totali di entrambi i rami. Lo <em>slug</em> resta quello di prima — è un
          identificativo, e gli identificativi non inseguono le etichette.
        </>
      }
      aperto={aperto}
      apri={() => setAperto(true)}
      chiudi={() => setAperto(false)}
      errore={errore}
    >
      <input
        value={n}
        onChange={(e) => setN(e.target.value)}
        placeholder="nome della categoria"
        className={CAMPO_PIENO}
        disabled={inCorso}
      />
      <Scelta
        valore={padre}
        cambia={setPadre}
        vuoto="— nessun genitore, è una radice —"
        opzioni={genitoriPossibili.map((x) => ({ id: x.id, testo: x.percorso }))}
        disabilitato={inCorso}
      />
      <Scelta
        valore={d}
        cambia={setD}
        vuoto="— senza discrezionalità predefinita —"
        opzioni={comeOpzioni(DISCREZIONALITA)}
        disabilitato={inCorso}
      />
      <p className="text-xs text-testo-2">
        La discrezionalità predefinita è quella che si applica a un esercente nuovo di questa
        categoria. Non riscrive quelli che ci sono già: la loro sta sull’esercente, e si cambia
        dalla sua scheda.
      </p>
      <button
        type="button"
        className={BOTTONE}
        disabled={inCorso || n.trim() === ''}
        onClick={() =>
          void scrivi('/api/admin/categorie', 'PATCH', {
            id,
            nome: n.trim(),
            discrezionalita: d === '' ? null : d,
            parentId: padre === '' ? null : padre,
            cambiaPadre: (padre === '' ? null : padre) !== parentId,
          })
        }
      >
        Applica alla tassonomia
      </button>
    </Pannello>
  );
}
