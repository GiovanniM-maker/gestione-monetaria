'use client';

import { useClassi, useClassiSceglibili } from '../classi-note';
import { useState } from 'react';
import Link from 'next/link';
import { formattaEuro, sommaCosti } from '@/lib/abbonamenti/formato';
import type { RigaDaConfermare, RigaRecente } from '@/lib/conferma/leggi';
import { BOTTONE, BOTTONE_MINORE, CAMPO_PIENO } from '@/lib/ui/controlli';
import { tinteDelleClassi } from '../grafici';
import { Avatar } from '@/lib/ui/tessera';
import {
  ORDINAMENTI,
  raggruppaPerTempo,
  type ChiaveGruppo,
  type Ordinamento,
} from '@/lib/conferma/gruppi';
import { Segmentato } from '../segmentato';
import { etichettaMovimento } from '@/lib/movimenti/etichetta';
import { Foglio } from '../foglio';
import { avvisa } from '../avviso';
import { SceltaCategoria } from '../scelta-categoria';
import { DecidiEsercente } from './decidi-esercente';
import { spiegaEccezione, spiegaRisposta, type Spiegazione } from '@/lib/ui/errori';
import { NotaErrore } from '@/lib/ui/nota-errore';
import { Icona } from '@/lib/ui/icone';

/**
 * La schermata piu' usata dell'applicazione, e l'unica che si apre per fare una
 * cosa invece che per guardarla.
 *
 * ---------------------------------------------------------------------------
 * Una carta per volta, non una riga di tabella
 * ---------------------------------------------------------------------------
 * Le righe erano dense e i bottoni piccoli in fondo: si leggeva bene con un
 * mouse e si sbagliava col pollice. Ogni movimento e' una carta con il suo
 * nome grande, l'importo grande, e i due gesti larghi quanto la colonna —
 * perche' il gesto e' l'unica ragione per cui questa schermata esiste.
 *
 * ---------------------------------------------------------------------------
 * «Va bene tutte»
 * ---------------------------------------------------------------------------
 * Due giorni saltati e la lista della sera diventa quindici righe identiche.
 * Una lista di arretrati non si smaltisce: si chiude. Il bottone chiede
 * conferma una volta — sono quindici approvazioni, non una — e resta a valle
 * dell'elenco: si preme dopo aver letto, non al posto di leggere.
 *
 * Nessuna delle due strade marca `manually_categorized`: «va bene» approva una
 * regola, non incide un valore.
 */

const CONTESTI = ['personale', 'business'] as const;

function euro(valore: string | null): string {
  if (valore === null) return '—';
  const { totale, nonLetti } = sommaCosti([valore]);
  return nonLetti > 0 ? '—' : formattaEuro(totale);
}

export function PannelloConferma({
  righe,
  recenti,
  categorie,
  fermi,
  oggi,
}: {
  righe: readonly RigaDaConfermare[];
  recenti: readonly RigaRecente[];
  /** L'albero, per dare una categoria a una riga che non ce l'ha. */
  categorie: readonly { id: string; percorso: string }[];
  /** Perche' quel che si vede e' vecchio, o `null` se non lo e'. */
  fermi: string | null;
  /** Il giorno di oggi in `Europe/Rome`, calcolato dal server. */
  oggi: string;
}) {
  /**
   * Quali righe stanno scrivendo, non «se qualcuno sta scrivendo».
   *
   * Da una stringa sola veniva un `occupato` unico che spegneva **tutti** i
   * bottoni della schermata: mentre si salvava la correzione di una riga, le
   * altre sei non si potevano nemmeno approvare. La conferma e' gia' diventata
   * ottimistica e non passa piu' di qui; la correzione il viaggio lo aspetta —
   * ed e' giusto, marca `manually_categorized` — ma deve aspettarlo **da
   * sola**.
   */
  const [inCorso, setInCorso] = useState<ReadonlySet<string>>(() => new Set());
  const [errore, setErrore] = useState<Spiegazione | null>(null);
  const [aperta, setAperta] = useState<string | null>(null);
  const [tutteChieste, setTutteChieste] = useState(false);
  const [ordinamento, setOrdinamento] = useState<Ordinamento>('data');
  /**
   * I gruppi chiusi. «Piu' di 7 giorni fa» nasce chiuso.
   *
   * E' il gruppo che si allunga da solo se si salta qualche sera, ed e' anche
   * quello meno urgente: aperto, spinge fuori schermo le due righe di oggi,
   * che sono il motivo per cui questa schermata si apre. Chiuso dice comunque
   * quante ne contiene, quindi non nasconde niente — sposta soltanto cio' che
   * si vede per primo.
   */
  const [chiusi, setChiusi] = useState<ReadonlySet<ChiaveGruppo>>(new Set(['prima']));

  /**
   * Le righe gia' sparite dallo schermo ma non ancora confermate dal server.
   *
   * ---------------------------------------------------------------------------
   * Un insieme di identificativi, non una copia della lista
   * ---------------------------------------------------------------------------
   * Copiare `righe` in uno stato locale significherebbe avere due verita' — i
   * dati del server e la copia — e doverle risincronizzare a ogni arrivo di
   * props nuove. Qui la verita' resta una, e questo insieme dice solo **cosa
   * nascondere**: se il server rifiuta, si toglie l'identificativo e la riga
   * torna esattamente dov'era, nel suo gruppo e nel suo ordine.
   */
  const [nascoste, setNascoste] = useState<ReadonlySet<string>>(new Set());

  const mostra = (ids: readonly string[]) =>
    setNascoste((prima) => {
      const dopo = new Set(prima);
      for (const id of ids) dopo.delete(id);
      return dopo;
    });

  /**
   * Conferma **ottimistica**: la riga esce subito, il viaggio parte dopo.
   *
   * Prima era `POST` e poi `router.refresh()`, cioe' un render completo del
   * server a cache appena invalidata — su sette movimenti, sette. E finche' il
   * viaggio non tornava, un solo `occupato` spegneva **tutti** i bottoni della
   * schermata: confermare la prima riga congelava le altre sei.
   *
   * Ora il tocco ha una conseguenza immediata, e cio' che puo' andare storto
   * ha una via d'uscita: se il server rifiuta la riga rientra e l'avviso lo
   * dice; se e' andata, l'avviso offre di disfarla per sei secondi.
   */
  async function conferma(ids: readonly string[], quante: number) {
    setErrore(null);
    setNascoste((prima) => new Set([...prima, ...ids]));
    setAperta(null);
    setTutteChieste(false);

    try {
      const risposta = await fetch('/api/admin/conferma', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(ids.length === 1 ? { id: ids[0] } : { ids }),
      });
      if (!risposta.ok) {
        mostra(ids);
        const spiegazione = await spiegaRisposta(risposta);
        setErrore(spiegazione);
        avvisa({ testo: spiegazione.titolo, tono: 'errore' });
        return;
      }
      avvisa({
        testo: quante === 1 ? 'Confermato' : `${quante} movimenti confermati`,
        annulla: async () => {
          // Disfare e' rimettere `confermato_at` a null: un campo solo, ed e'
          // il motivo per cui l'annulla qui e' onesto e sulla correzione no.
          try {
            await fetch('/api/admin/conferma', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ disconferma: ids }),
            });
          } finally {
            // La riga torna comunque: se l'annulla e' fallito, vederla di nuovo
            // in lista e' meno sbagliato che crederla disfatta.
            mostra(ids);
          }
        },
      });
    } catch (e) {
      mostra(ids);
      const spiegazione = spiegaEccezione(e);
      setErrore(spiegazione);
      avvisa({ testo: spiegazione.titolo, tono: 'errore' });
    }
  }

  /**
   * La correzione: qui il viaggio si aspetta.
   *
   * Non e' un tocco, e' un modulo riempito: marca `manually_categorized`, che
   * blocca per sempre ogni automatismo su quella riga. Farla sparire prima di
   * sapere che e' andata vorrebbe dire mostrare come inciso qualcosa che il
   * database potrebbe non avere.
   */
  async function scrivi(corpo: Record<string, unknown>, chiave: string) {
    setInCorso((q) => new Set(q).add(chiave));
    setErrore(null);
    try {
      const risposta = await fetch('/api/admin/conferma', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(corpo),
      });
      if (!risposta.ok) {
        setErrore(await spiegaRisposta(risposta));
        return;
      }
      setAperta(null);
      setNascoste((prima) => new Set([...prima, String(corpo['id'] ?? '')]));
      avvisa({ testo: 'Corretto' });
    } catch (e) {
      setErrore(spiegaEccezione(e));
    } finally {
      setInCorso((q) => {
        const r = new Set(q);
        r.delete(chiave);
        return r;
      });
    }
  }

  /**
   * «Sei in pari».
   *
   * Non e' un riquadro vuoto con scritto «nessun risultato»: e' la schermata
   * che si vede piu' spesso quando l'abitudine ha preso, e vale la pena che
   * dica una cosa buona invece di sembrare rotta.
   */
  const visibili = righe.filter((r) => !nascoste.has(r.id));

  if (visibili.length === 0) {
    /* Con i dati fermi «sei in pari» e' una bugia detta con un segno di spunta
       verde: non c'e' niente da confermare perche' non e' arrivato niente. Il
       segno resta — la lista e' davvero vuota — ma smette di essere una lode. */
    const inPari = fermi === null;
    return (
      <div className="space-y-6">
        {fermi !== null && <p className="nota nota-avviso text-sec">{fermi}</p>}

        <div className="scheda space-y-3 p-6 text-center">
          {/* La spunta verde di vetro quando e' una lode vera; il cerchio
              spento quando la lista e' vuota perche' non e' arrivato niente.
              Dare l'illustrazione anche al secondo caso vestirebbe a festa
              una risposta che e' «non lo so». */}
          {inPari ? (
            <img
              src="/illustrazioni/sei-in-pari.webp"
              alt=""
              width={84}
              height={84}
              className="mx-auto drop-shadow-[0_8px_20px_rgb(48_209_88/0.25)]"
            />
          ) : (
            <p
              // L'ultimo glifo tipografico usato come icona. Il `✓` di sistema
              // ha un peso e uno stile decisi da chi ha disegnato il carattere,
              // e in una schermata che dice «sei in pari» era la cosa piu'
              // grande sullo schermo.
              className="mx-auto flex size-14 items-center justify-center rounded-full"
              style={{ background: 'var(--s3)', color: 'var(--conferma)' }}
              aria-hidden="true"
            >
              <Icona nome="spunta" misura={26} spessore={2} />
            </p>
          )}
          <p className="text-sez font-semibold">
            {inPari ? 'Sei in pari.' : 'Niente da confermare.'}
          </p>
          <p className="text-sec text-testo-2">
            {inPari
              ? 'Tutti i movimenti contabilizzati sono stati visti.'
              : 'Di quello che è arrivato, tutto è stato visto. Quello che non è arrivato non si può contare.'}
          </p>
          <p className="text-min text-testo-2">
            Quelli ancora <strong>provvisori</strong> non compaiono qui: la banca non li ha
            contabilizzati, l&rsquo;importo pu&ograve; cambiare, e confermarli adesso vorrebbe dire
            riconfermarli dopo.
          </p>
        </div>

        <Ultime24Ore righe={recenti} fermi={fermi} />
      </div>
    );
  }

  // Le azioni **globali** — «va bene tutte» e il suo annulla — restano ferme
  // finche' una correzione e' in volo: approvare in blocco mentre si sta
  // incidendo una riga e' una sovrapposizione che non si spiega. Le azioni di
  // riga guardano invece la propria riga.
  const occupato = inCorso.size > 0;
  const gruppi = raggruppaPerTempo(visibili, oggi, ordinamento, (r) => r.amount_eur ?? r.amount);

  return (
    <div className="space-y-4">
      <NotaErrore errore={errore} />
      {/* Anche con la lista piena: quello che c'e' e' vecchio, e confermarlo
          non fa arrivare il resto. */}
      {fermi !== null && <p className="nota nota-avviso text-sec">{fermi}</p>}

      {/* La riga di controllo: quante sono, e con che ordine.

          L'ordinamento sta accanto al conteggio e non dentro un pannello di
          filtri: e' l'unica scelta che questa schermata offre sulla lista, e
          nasconderla dietro un tocco vorrebbe dire che nessuno la trova. */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sec text-testo-2">
          {visibili.length} {visibili.length === 1 ? 'movimento' : 'movimenti'}
        </p>
        <div className="w-[210px]">
          <Segmentato
            etichetta="Come ordinare"
            voci={ORDINAMENTI.map((o) => ({
              chiave: o,
              testo: o === 'data' ? 'per data' : 'per importo',
              attiva: ordinamento === o,
              onScegli: () => setOrdinamento(o),
            }))}
          />
        </div>
      </div>

      {gruppi.map((g) => {
        const chiuso = chiusi.has(g.chiave);
        return (
          <section key={g.chiave} className="space-y-3">
            <button
              type="button"
              onClick={() =>
                setChiusi((s) => {
                  const n = new Set(s);
                  if (chiuso) n.delete(g.chiave);
                  else n.add(g.chiave);
                  return n;
                })
              }
              aria-expanded={!chiuso}
              className="flex min-h-11 w-full items-center gap-2 text-left"
            >
              <span className="text-corpo font-semibold tracking-[-0.02em]">{g.nome}</span>
              <span className="cifra text-sec text-testo-2">{g.righe.length}</span>
              <span className="flex-1" />
              <span
                aria-hidden="true"
                className="shrink-0 text-testo-3 transition-transform duration-150"
                style={{ transform: chiuso ? 'none' : 'rotate(90deg)' }}
              >
                <Icona nome="chevron" misura={16} />
              </span>
            </button>

            {!chiuso && (
              <ul className="space-y-3">
                {g.righe.map((r) => (
                  <li key={r.id} className="scheda p-4">
                    <Carta riga={r} categorie={categorie} />

                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        disabled={inCorso.has(r.id)}
                        onClick={() => void conferma([r.id], 1)}
                        className={`${BOTTONE} flex-1`}
                      >
                        Va bene
                      </button>
                      <button
                        type="button"
                        disabled={inCorso.has(r.id)}
                        onClick={() => setAperta(r.id)}
                        className={`${BOTTONE_MINORE} flex-1`}
                      >
                        Correggi
                      </button>
                    </div>

                    {/* La correzione sale dal basso invece di aprirsi dentro la
                        carta: aperta in linea spingeva giu' tutte le altre e la
                        riga che si stava guardando finiva fuori schermo. */}
                    <Correzione
                      riga={r}
                      categorie={categorie}
                      aperta={aperta === r.id}
                      occupato={inCorso.has(r.id)}
                      onAnnulla={() => setAperta(null)}
                      onSalva={(corpo) => void scrivi({ id: r.id, ...corpo }, r.id)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      {/* In fondo e non in cima: si preme dopo aver letto, non al posto di
          leggere. */}
      {visibili.length > 1 &&
        (tutteChieste ? (
          <div className="scheda space-y-3 p-4">
            <p className="text-sec">
              Approvo la classificazione proposta per tutti e{' '}
              <strong>{righe.length} i movimenti</strong>?
            </p>
            <p className="text-min text-testo-2">
              Restano agganciati al loro esercente: se domani ne cambi la classificazione, la
              seguono. Niente viene inciso.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={occupato}
                className={`${BOTTONE} flex-1`}
                onClick={() =>
                  void conferma(
                    visibili.map((r) => r.id),
                    visibili.length,
                  )
                }
              >
                {`Sì, approva le ${visibili.length}`}
              </button>
              <button
                type="button"
                disabled={occupato}
                className={BOTTONE_MINORE}
                onClick={() => setTutteChieste(false)}
              >
                Annulla
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            disabled={occupato}
            className={`${BOTTONE_MINORE} w-full`}
            onClick={() => setTutteChieste(true)}
          >
            Va bene tutte
          </button>
        ))}

      <div className="pt-3">
        <Ultime24Ore righe={recenti} fermi={fermi} />
      </div>
    </div>
  );
}

/**
 * Cosa e' stato pagato oggi e ieri, confermato o no.
 *
 * ---------------------------------------------------------------------------
 * Perche' e' una lista a parte
 * ---------------------------------------------------------------------------
 * «Da confermare» chiede un'azione e **si svuota**: e' la lista della sera, e
 * il suo pregio e' che finisce. Questa non si svuota mai e non chiede niente —
 * serve a **rivedere**: riconoscere una spesa che non ricordi, o accorgerti di
 * un addebito che non hai fatto.
 *
 * Sono due bisogni diversi, e tenerli nella stessa lista li rovinava entrambi:
 * appena approvavi una riga spariva, quindi dieci minuti dopo l'addebito che
 * volevi ricontrollare non c'era piu' — e proprio l'averlo approvato lo aveva
 * nascosto.
 *
 * Chiusa di suo: chi apre questa schermata la apre per premere «va bene». Il
 * titolo dice gia' quanti e quanto, che e' la meta' dell'informazione, e si
 * apre solo quando qualcosa non torna.
 *
 * ---------------------------------------------------------------------------
 * Vuota non vuol dire «non hai speso»
 * ---------------------------------------------------------------------------
 * Diceva «nessun pagamento nelle ultime 24 ore», e il 16 agosto 2026 era falso:
 * i pagamenti c'erano, era lo **scarico** a essere fermo da tre giorni. Le due
 * risposte sono «non hai pagato niente» e «non lo so», si assomigliano solo
 * finche' tutto funziona, e la prima detta al posto della seconda e' il modo
 * piu' rapido di far smettere di credere a una schermata.
 */
function Ultime24Ore({ righe, fermi }: { righe: readonly RigaRecente[]; fermi: string | null }) {
  const tinte = tinteDelleClassi(useClassi());
  const totale = righe.reduce((s, r) => {
    const { totale: v, nonLetti } = sommaCosti([r.amount_eur ?? r.amount]);
    return nonLetti > 0 ? s : s + v;
  }, 0n);

  return (
    <details className="scheda p-4">
      <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
        <span className="min-w-0 flex-1">
          <span className="block text-corpo font-medium">Pagato oggi e ieri</span>
          <span className="block text-min text-testo-2">
            {righe.length > 0
              ? `${righe.length} ${righe.length === 1 ? 'pagamento' : 'pagamenti'} · ${formattaEuro(totale)}`
              : fermi === null
                ? 'nessun pagamento nelle ultime 24 ore'
                : 'non lo sappiamo: lo scarico dalla banca è fermo'}
          </span>
        </span>
        <Icona nome="chevron" misura={16} className="shrink-0 text-testo-3" />
      </summary>

      {righe.length > 0 && (
        <ul className="elenco pt-2 text-corpo">
          {righe.map((r) => (
            <li key={r.id}>
              <Link href={`/movimenti/${r.id}`} className="flex min-h-12 items-center gap-3">
                <Avatar
                  nome={etichettaMovimento(r)}
                  misura={30}
                  tinta={
                    r.discrezionalita !== null
                      ? (tinte[r.discrezionalita] ?? 'var(--neutro)')
                      : 'var(--neutro)'
                  }
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{etichettaMovimento(r)}</span>
                  <span className="block truncate text-min text-testo-2">
                    {r.booking_date}
                    {r.categoria !== null && ` · ${r.categoria}`}
                    {/* Le due cose che cambiano come si legge la riga: una
                        provvisoria puo' ancora muoversi, una non confermata e'
                        ancora nella lista sopra. */}
                    {r.stato === 'pending' && ' · provvisorio'}
                    {r.confermato_at === null && ' · da confermare'}
                  </span>
                </span>
                <span className="cifra shrink-0 whitespace-nowrap">
                  {euro(r.amount_eur ?? r.amount)}
                </span>
                <Icona nome="chevron" misura={16} className="shrink-0 text-testo-3" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

/** Il corpo della carta: chi, quanto, quando, e cosa ne pensa l'applicazione. */
function Carta({
  riga: r,
  categorie,
}: {
  riga: RigaDaConfermare;
  categorie: readonly { id: string; percorso: string }[];
}) {
  const tinte = tinteDelleClassi(useClassi());
  const tinta = r.discrezionalita === null ? null : (tinte[r.discrezionalita] ?? null);

  return (
    <>
      <div className="flex items-start gap-3">
        <Avatar nome={etichettaMovimento(r)} tinta={tinta ?? 'var(--neutro)'} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sez font-semibold">{etichettaMovimento(r)}</span>
          <span className="cifra text-sec text-testo-2">{r.booking_date}</span>
        </span>
        <span className="numerone shrink-0 text-titolo">{euro(r.amount_eur ?? r.amount)}</span>
      </div>

      <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sec text-testo-2">
        <span
          aria-hidden="true"
          className="size-2.5 shrink-0 rounded-full"
          style={{ background: tinta ?? 'var(--neutro)' }}
        />
        <span>{r.categoria ?? 'senza categoria'}</span>
        <span className="text-testo-2">·</span>
        <span>{r.discrezionalita ?? 'non classificato'}</span>
        {r.contesto !== null && (
          <>
            <span className="text-testo-2">·</span>
            <span>{r.contesto}</span>
          </>
        )}
      </p>

      {/* Una riga scoperta non si sistema con «va bene»: confermare non da' una
          categoria, e senza quella la spesa resta fuori da ogni aggregato pur
          restando nel totale.

          Qui c'era **solo** una nota che diceva di aprire «Correggi». Era un
          vicolo cieco: quel foglio cambia discrezionalita', contesto e note, e
          la categoria non la tocca — lo dice lui stesso, «si cambia da
          revisione». E per un bonifico a un privato non c'e' nemmeno un
          esercente da correggere, quindi non c'era **nessuna** strada.

          Adesso il controllo sta qui, dove si vede il problema. E' lo stesso
          selettore di `/movimenti` e `/esercenti`: foglio dal basso, ricerca,
          e la categoria si puo' creare da dentro se non esiste. */}
      {r.motivo === 'senza categoria' && (
        <div className="nota nota-avviso mt-3 space-y-2 text-sec">
          <p>
            <strong>Manca la categoria.</strong> Confermare non gliela d&agrave;: la spesa
            resterebbe nel totale ma fuori da ogni aggregato.
          </p>
          <SceltaCategoria
            ambito={{ tipo: 'movimento', movimentoId: r.id }}
            categoriaId={r.category_id}
            categorie={categorie}
          />
        </div>
      )}

      {/* Una proposta mai confermata va detta: vale per i conteggi, ma nessuno
          l'ha ancora guardata, ed e' la prima da mettere in dubbio. */}
      {r.origine_classificazione === 'ai' && r.esercente_confermato_at === null && (
        <p className="mt-2 text-min text-attenzione">
          Proposta dal modello{r.motivazione !== null && `: ${r.motivazione}`}
        </p>
      )}

      {/* Un esercente che nessuno ha mai guardato si decide **qui**, la prima
          sera che compare: e' il momento in cui ci si accorge che va deciso, e
          finora l'unico posto per farlo era la sua scheda — dove si arriva solo
          se si e' gia' capito che serviva.

          Sopra c'e' «Proposta dal modello», che dice **che** e' da guardare;
          questo dice **cosa fare**, ed e' il gesto che fa sparire tutti e due. */}
      {r.merchant_id !== null && r.esercente_confermato_at === null && (
        <DecidiEsercente
          merchantId={r.merchant_id}
          esercente={r.esercente ?? 'questo esercente'}
          categoriaId={r.category_id}
          categorie={categorie}
        />
      )}
    </>
  );
}

function Correzione({
  riga,
  categorie,
  aperta,
  occupato,
  onAnnulla,
  onSalva,
}: {
  riga: RigaDaConfermare;
  categorie: readonly { id: string; percorso: string }[];
  aperta: boolean;
  occupato: boolean;
  onAnnulla: () => void;
  onSalva: (corpo: Record<string, unknown>) => void;
}) {
  const classiSceglibili = useClassiSceglibili();
  const [discrezionalita, setDiscrezionalita] = useState(riga.discrezionalita ?? '');
  const [contesto, setContesto] = useState(riga.contesto ?? '');
  const [note, setNote] = useState(riga.note ?? '');

  return (
    <Foglio
      aperto={aperta}
      titolo={riga.esercente ?? 'Questa spesa'}
      nota="Vale solo per questa spesa, e la marca come corretta a mano."
      onChiudi={onAnnulla}
    >
      {/* La categoria si sceglie **qui**, o il messaggio sulla carta manderebbe
          su un foglio che non sa fare la cosa per cui ci ha mandati. Vale per
          questa riga sola, come tutto il resto del foglio: la classificazione
          di tutte le occorrenze dell'esercente sta sulla sua scheda, dove la
          portata e' scritta sopra. */}
      <div className="mb-2 space-y-1">
        <span className="text-min text-testo-2">categoria</span>
        <SceltaCategoria
          ambito={{ tipo: 'movimento', movimentoId: riga.id }}
          categoriaId={riga.category_id}
          categorie={categorie}
        />
      </div>

      {/* Due righe e non un paragrafo. I due fatti che servono sono che si
          applica subito — i due campi sotto invece dicono «non cambiare» e
          aspettano Salva — e dove si va per cambiarla a tutte. Il resto e'
          prosa in mezzo ai controlli. */}
      <p className="mb-3 text-min text-testo-2">
        Si applica appena la scegli. Per <strong>tutte</strong> le spese dell&rsquo;esercente:{' '}
        <Link className="text-accento" href="/revisione">
          revisione
        </Link>
        .
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="text-min text-testo-2">discrezionalità</span>
          <select
            value={discrezionalita}
            onChange={(e) => setDiscrezionalita(e.target.value)}
            className={CAMPO_PIENO}
            disabled={occupato}
          >
            <option value="">— non cambiare —</option>
            {classiSceglibili.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-min text-testo-2">contesto</span>
          <select
            value={contesto}
            onChange={(e) => setContesto(e.target.value)}
            className={CAMPO_PIENO}
            disabled={occupato}
          >
            <option value="">— non cambiare —</option>
            {CONTESTI.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="perché fa eccezione (facoltativo)"
        className={`${CAMPO_PIENO} mt-2`}
        disabled={occupato}
      />
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={occupato}
          className={`${BOTTONE} flex-1`}
          onClick={() =>
            onSalva({
              discrezionalita: discrezionalita === '' ? null : discrezionalita,
              contesto: contesto === '' ? null : contesto,
              note: note.trim() === '' ? null : note.trim(),
            })
          }
        >
          Salva la correzione
        </button>
        <button type="button" disabled={occupato} className={BOTTONE_MINORE} onClick={onAnnulla}>
          Annulla
        </button>
      </div>
    </Foglio>
  );
}
