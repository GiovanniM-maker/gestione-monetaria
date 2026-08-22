'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Foglio } from './foglio';
import { spiegaEccezione, spiegaRisposta, spiegaTesto, type Spiegazione } from '@/lib/ui/errori';
import { NotaErrore } from '@/lib/ui/nota-errore';
import { Icona } from '@/lib/ui/icone';
import { allInvio } from '@/lib/ui/invio';

/**
 * Il selettore di categoria dentro una riga di elenco.
 *
 * Entrare in una scheda per cambiare una categoria costa due navigazioni e un
 * ritorno indietro, e su un telefono e' la differenza fra sistemare venti righe
 * e sistemarne tre. Qui si cambia dove si guarda.
 *
 * ---------------------------------------------------------------------------
 * Un foglio dal basso al posto di un `<select>`
 * ---------------------------------------------------------------------------
 * Era un menu a tendina nativo con trentacinque voci, ognuna un percorso intero
 * (`Ristorazione > Ristoranti`). Su un telefono quella tendina e' una colonna
 * di righe alte venti pixel con i nomi troncati, e per arrivare a «Trasporti»
 * si scorre alla cieca. Il foglio ha righe alte quarantaquattro, i percorsi per
 * intero, la categoria attuale segnata, e **una casella di ricerca**: con
 * trentacinque voci scrivere tre lettere e' sempre piu' veloce che scorrere.
 *
 * Il filtro e' in memoria e non una query: le categorie sono gia' tutte qui,
 * arrivano con la pagina.
 *
 * ---------------------------------------------------------------------------
 * La portata dipende dall'esercente, e sta scritta sul bottone
 * ---------------------------------------------------------------------------
 * E' un controllo solo, ma fa due cose diverse — ed e' voluto, perche' la cosa
 * giusta da fare dipende dal caso e non dallo schermo su cui si e':
 *
 *   esercente **fisso**     -> cambia la categoria dell'**esercente**, cioe' di
 *                              tutte le sue spese. E' quello che si vuole
 *                              davvero quando si vede «McDonald's» nel posto
 *                              sbagliato: correggerlo una volta per sempre;
 *   esercente **variabile** -> cambia **questa riga**, e la marca come corretta
 *                              a mano. E' il computer comprato da Amazon.
 *
 * Due parole accanto al controllo e la frase intera nel foglio. Un controllo
 * che a volte tocca una riga e a volte trecento senza dirlo sarebbe la cosa
 * piu' pericolosa dell'applicazione.
 */

export type Ambito =
  { tipo: 'esercente'; merchantId: string } | { tipo: 'movimento'; movimentoId: string };

/**
 * Fin dove arriva il cambio.
 *
 * `breve` era «tutte le sue» / «solo questa», e la frase intera stava dentro un
 * `title=`. Su un telefono `title` **non compare mai**: la distinzione che il
 * commento qui sopra chiama «la cosa piu' pericolosa dell'applicazione» era
 * invisibile proprio dove l'applicazione si usa.
 *
 * Ora `breve` dice gia' la conseguenza — «cambia tutte le sue spese» — quindi
 * si regge da sola, e la frase intera resta nella testata del foglio, dove c'e'
 * lo spazio per leggerla prima di scegliere.
 */
const PORTATA: Record<Ambito['tipo'], { breve: string; intera: string }> = {
  esercente: {
    breve: 'cambia tutte le sue spese',
    intera: 'Vale per tutte le spese di questo esercente, anche quelle dei mesi già chiusi.',
  },
  movimento: {
    breve: 'cambia solo questa riga',
    intera:
      'Vale solo per questa riga, e la marca come corretta a mano: da lì in poi nessun automatismo la tocca.',
  },
};

export function SceltaCategoria({
  ambito,
  categoriaId,
  categorie,
  etichetta,
}: {
  ambito: Ambito;
  categoriaId: string | null;
  categorie: readonly { id: string; percorso: string }[];
  /** Se `true` mostra accanto al bottone fin dove arriva il cambio. */
  etichetta?: boolean;
}) {
  const router = useRouter();
  /** Quello che sta nel database. */
  const [valore, setValore] = useState(categoriaId ?? '');
  /**
   * Quello che si sta scegliendo, e che non e' ancora scritto.
   *
   * Prima non esisteva: toccare una riga dell'elenco **scriveva**. Su un
   * telefono, dove si tocca per leggere meglio quanto per decidere, e' il modo
   * piu' rapido di cambiare la categoria di una spesa senza volerlo — e su
   * `movimento` quella scrittura marca anche `manually_categorized`, che
   * blocca per sempre ogni automatismo su quella riga. Un gesto ambiguo non
   * puo' avere una conseguenza definitiva.
   */
  const [scelto, setScelto] = useState(categoriaId ?? '');
  const [aperto, setAperto] = useState(false);
  const [cerca, setCerca] = useState('');
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<Spiegazione | null>(null);
  /** Quando si sta scrivendo il nome di una categoria che non esiste ancora. */
  const [creando, setCreando] = useState(false);
  const [nuova, setNuova] = useState('');
  const [dentro, setDentro] = useState('');

  const attuale = categorie.find((c) => c.id === valore)?.percorso ?? null;
  const ago = cerca.trim().toLowerCase();
  const viste =
    ago === '' ? categorie : categorie.filter((c) => c.percorso.toLowerCase().includes(ago));

  /**
   * Creare una categoria da qui, senza uscire.
   *
   * E' il buco che si sentiva usando l'app: stai classificando un esercente,
   * la categoria giusta non c'e', e per crearla devi abbandonare quello che
   * stai facendo, andare in `/categorie`, crearla, tornare indietro e
   * ritrovare la riga. Cinque passi per una parola.
   *
   * La creazione e l'assegnazione sono **due scritture separate** e restano
   * tali: `crea_categoria` fa la prima e torna l'identificativo, che diventa
   * subito l'argomento della seconda. E' anche rieseguibile — se la categoria
   * esiste gia' con quel nome sotto quel padre, la funzione SQL restituisce
   * quella invece di crearne una seconda.
   */
  async function creaEAssegna() {
    const nome = nuova.trim();
    if (nome === '') return;
    setInCorso(true);
    setErrore(null);
    try {
      const risposta = await fetch('/api/admin/categorie', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nome, padreId: dentro === '' ? null : dentro }),
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
            'Chiudi il foglio e riaprilo: la troverai nell’elenco.',
          ),
        );
        return;
      }
      setCreando(false);
      setNuova('');
      setDentro('');
      // Creata e **scelta**, non assegnata: la scrittura sulla riga la fa
      // «Salva», come per ogni altra categoria dell'elenco. Creare una
      // categoria e' un atto suo, e resta fatto anche se poi si annulla.
      setScelto(id);
    } catch (e) {
      setErrore(spiegaEccezione(e));
    } finally {
      setInCorso(false);
    }
  }

  async function cambia(nuovo: string) {
    const prima = valore;
    setValore(nuovo);
    setScelto(nuovo);
    setAperto(false);
    setCerca('');
    setInCorso(true);
    setErrore(null);
    try {
      const [url, metodo, corpo] =
        ambito.tipo === 'esercente'
          ? ([
              '/api/admin/tassonomia',
              'PATCH',
              { id: ambito.merchantId, category_id: nuovo === '' ? null : nuovo },
            ] as const)
          : ([
              '/api/admin/movimenti/classifica',
              'POST',
              { id: ambito.movimentoId, categoriaId: nuovo === '' ? null : nuovo },
            ] as const);

      const risposta = await fetch(url, {
        method: metodo,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(corpo),
      });
      if (!risposta.ok) {
        // Si torna al valore di prima: a schermo non deve restare una scelta
        // che il database non ha.
        setValore(prima);
        setScelto(prima);
        setErrore(await spiegaRisposta(risposta));
        return;
      }
      router.refresh();
    } catch (e) {
      setValore(prima);
      setErrore(spiegaEccezione(e));
    } finally {
      setInCorso(false);
    }
  }

  return (
    // `min-w-0 flex-1` e non `w-full`: dentro la riga di `/esercenti` questo
    // controllo sta **accanto** all'interruttore fisso/variabile, e un
    // `width: 100%` li' dentro somma la propria larghezza a quella del vicino
    // e allarga la pagina. Il sintomo era subdolo: su un telefono la finestra
    // di layout si allarga da sola per contenere il traboccamento, quindi
    // `scrollWidth > innerWidth` restava falso e il controllo non se ne
    // accorgeva. Si vede solo confrontando con la larghezza **del dispositivo**.
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setAperto(true)}
          disabled={inCorso}
          className={`flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-controllo bg-s3 px-3 text-left text-sec pointer-fine:min-h-9 ${
            inCorso ? 'opacity-60' : ''
          }`}
        >
          <span className={`min-w-0 flex-1 truncate ${attuale === null ? 'text-testo-2' : ''}`}>
            {attuale ?? 'senza categoria'}
          </span>
          <Icona nome="chevron" misura={16} className="shrink-0 text-testo-3" />
        </button>
      </div>

      {/* Sotto il controllo e non accanto: accanto stava su una riga sola con il
          percorso della categoria, e su uno schermo stretto era la prima cosa a
          essere troncata — cioe' l'informazione che dice quanto costa il tocco
          spariva esattamente sullo schermo su cui il tocco avviene. */}
      {etichetta === true && (
        <p className="mt-1 text-eti text-testo-2">{PORTATA[ambito.tipo].breve}</p>
      )}

      <NotaErrore errore={errore} />

      <Foglio
        aperto={aperto}
        titolo="In che categoria"
        nota={PORTATA[ambito.tipo].intera}
        onChiudi={() => {
          setAperto(false);
          setCerca('');
          setCreando(false);
          // Chiudere senza salvare **annulla**: se la scelta in sospeso
          // restasse, riaprendo il foglio si troverebbe il segno di spunta su
          // una categoria che il database non ha, e si crederebbe assegnata.
          setScelto(valore);
        }}
      >
        {creando ? (
          <div className="space-y-3">
            <input
              value={nuova}
              onChange={(e) => setNuova(e.target.value)}
              onKeyDown={allInvio(() => void creaEAssegna(), !inCorso && nuova.trim() !== '')}
              placeholder="nome della categoria"
              className="min-h-11 w-full rounded-controllo bg-s3 px-3.5 text-corpo placeholder:text-testo-3"
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
                className="min-h-11 w-full rounded-controllo bg-s3 px-3 text-corpo"
                disabled={inCorso}
              >
                <option value="">di primo livello</option>
                {categorie.map((c) => (
                  <option key={c.id} value={c.id}>
                    dentro {c.percorso}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-min text-testo-2">
              Appena creata viene <strong>scelta</strong> qui: per assegnarla serve
              &laquo;Salva&raquo;, come per ogni altra. Se esiste gi&agrave; con lo stesso nome
              nello stesso posto, si usa quella.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void creaEAssegna()}
                disabled={inCorso || nuova.trim() === ''}
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-controllo bg-accento text-corpo font-semibold text-accento-testo disabled:opacity-40"
              >
                {inCorso ? '…' : 'Crea e scegli'}
              </button>
              <button
                type="button"
                onClick={() => setCreando(false)}
                disabled={inCorso}
                className="inline-flex min-h-11 items-center justify-center rounded-controllo bg-s3 px-3.5 text-sec font-medium"
              >
                Annulla
              </button>
            </div>
          </div>
        ) : (
          <>
            <input
              type="search"
              value={cerca}
              onChange={(e) => setCerca(e.target.value)}
              placeholder="cerca una categoria"
              className="mb-2 min-h-11 w-full rounded-controllo bg-s3 px-3.5 text-corpo placeholder:text-testo-3"
            />

            {/* Il posto in cui ci si accorge che una categoria manca e' questo:
            stai scegliendo e non la trovi. Crearla da qui costa un tocco;
            uscire, andare in `/categorie`, tornare e ritrovare la riga ne
            costa cinque. */}
            <button
              type="button"
              onClick={() => {
                setCreando(true);
                setNuova(cerca.trim());
              }}
              className="mb-1 flex min-h-12 w-full items-center gap-2 text-left text-corpo text-accento"
            >
              <span aria-hidden="true" className="text-sez leading-none">
                +
              </span>
              {cerca.trim() === '' ? 'Nuova categoria' : `Crea «${cerca.trim()}»`}
            </button>

            <ul className="elenco text-corpo">
              <Riga
                testo="senza categoria"
                scelta={scelto === ''}
                spenta
                onScegli={() => setScelto('')}
              />
              {viste.map((c) => (
                <Riga
                  key={c.id}
                  testo={c.percorso}
                  scelta={c.id === scelto}
                  onScegli={() => setScelto(c.id)}
                />
              ))}
            </ul>

            {viste.length === 0 && (
              <p className="py-6 text-center text-sec text-testo-2">
                Nessuna categoria con questo nome.
              </p>
            )}

            {/* «Salva» in fondo, e non un tocco che scrive.

                Scegliere e confermare erano lo stesso gesto: si toccava una
                riga dell'elenco e la scrittura partiva. Su un telefono si tocca
                per leggere meglio quanto per decidere, e su un movimento quella
                scrittura marca anche `manually_categorized`, che blocca per
                sempre ogni automatismo su quella riga. Un gesto ambiguo non
                puo' avere una conseguenza definitiva.

                Resta appiccicato in fondo mentre l'elenco scorre: con
                trentacinque categorie, un bottone in coda alla lista si
                raggiunge scorrendo, e a quel punto non si sa piu' cosa si e'
                scelto. */}
            <div className="sticky bottom-0 -mx-4 mt-2 flex gap-2 bg-s2 px-4 pt-3 pb-1">
              <button
                type="button"
                onClick={() => void cambia(scelto)}
                disabled={inCorso || scelto === valore}
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-controllo bg-accento text-corpo font-semibold text-accento-testo disabled:opacity-40"
              >
                {inCorso ? '…' : scelto === valore ? 'Nessuna modifica' : 'Salva'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setScelto(valore);
                  setAperto(false);
                  setCerca('');
                }}
                disabled={inCorso}
                className="inline-flex min-h-11 items-center justify-center rounded-controllo bg-s3 px-3.5 text-sec font-medium"
              >
                Annulla
              </button>
            </div>
          </>
        )}

        <NotaErrore errore={errore} />
      </Foglio>
    </div>
  );
}

function Riga({
  testo,
  scelta,
  spenta,
  onScegli,
}: {
  testo: string;
  scelta: boolean;
  spenta?: boolean;
  onScegli: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onScegli}
        aria-current={scelta ? 'true' : undefined}
        className={`flex min-h-12 w-full items-center gap-3 text-left ${
          spenta === true ? 'text-testo-2' : ''
        }`}
      >
        <span className="min-w-0 flex-1">{testo}</span>
        {/* Il segno di spunta e non un pallino: dice «questa» senza dover essere
            un controllo a sua volta. */}
        {scelta && (
          <span aria-hidden="true" className="shrink-0 text-accento">
            ✓
          </span>
        )}
      </button>
    </li>
  );
}
