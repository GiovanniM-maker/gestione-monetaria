'use client';

import { useClassi, useClassiSceglibili } from '../classi-note';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
import { Foglio } from '../foglio';
import { SceltaCategoria } from '../scelta-categoria';
import { etichettaMovimento } from '@/lib/movimenti/etichetta';

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
  const router = useRouter();
  const [inCorso, setInCorso] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
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

  async function scrivi(corpo: Record<string, unknown>, chiave: string) {
    setInCorso(chiave);
    setErrore(null);
    try {
      const risposta = await fetch('/api/admin/conferma', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(corpo),
      });
      const esito = (await risposta.json()) as Record<string, unknown>;
      if (!risposta.ok) {
        setErrore(String(esito['error'] ?? risposta.status));
        return;
      }
      setAperta(null);
      setTutteChieste(false);
      router.refresh();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : String(e));
    } finally {
      setInCorso(null);
    }
  }

  /**
   * «Sei in pari».
   *
   * Non e' un riquadro vuoto con scritto «nessun risultato»: e' la schermata
   * che si vede piu' spesso quando l'abitudine ha preso, e vale la pena che
   * dica una cosa buona invece di sembrare rotta.
   */
  if (righe.length === 0) {
    /* Con i dati fermi «sei in pari» e' una bugia detta con un segno di spunta
       verde: non c'e' niente da confermare perche' non e' arrivato niente. Il
       segno resta — la lista e' davvero vuota — ma smette di essere una lode. */
    const inPari = fermi === null;
    return (
      <div className="space-y-6">
        {fermi !== null && <p className="nota nota-avviso text-[13px]">{fermi}</p>}

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
              className="mx-auto flex size-14 items-center justify-center rounded-full text-[26px] leading-none"
              style={{ background: 'var(--s3)', color: 'var(--testo-3)' }}
              aria-hidden="true"
            >
              ✓
            </p>
          )}
          <p className="text-[17px] font-semibold">
            {inPari ? 'Sei in pari.' : 'Niente da confermare.'}
          </p>
          <p className="text-[13px] text-testo-2">
            {inPari
              ? 'Tutti i movimenti contabilizzati sono stati visti.'
              : 'Di quello che è arrivato, tutto è stato visto. Quello che non è arrivato non si può contare.'}
          </p>
          <p className="text-[12px] text-testo-3">
            Quelli ancora <strong>provvisori</strong> non compaiono qui: la banca non li ha
            contabilizzati, l&rsquo;importo pu&ograve; cambiare, e confermarli adesso vorrebbe dire
            riconfermarli dopo.
          </p>
        </div>

        <Ultime24Ore righe={recenti} fermi={fermi} />
      </div>
    );
  }

  const occupato = inCorso !== null;
  const gruppi = raggruppaPerTempo(righe, oggi, ordinamento, (r) => r.amount_eur ?? r.amount);

  return (
    <div className="space-y-4">
      {errore !== null && <p className="nota nota-errore text-[14px]">{errore}</p>}
      {/* Anche con la lista piena: quello che c'e' e' vecchio, e confermarlo
          non fa arrivare il resto. */}
      {fermi !== null && <p className="nota nota-avviso text-[13px]">{fermi}</p>}

      {/* La riga di controllo: quante sono, e con che ordine.

          L'ordinamento sta accanto al conteggio e non dentro un pannello di
          filtri: e' l'unica scelta che questa schermata offre sulla lista, e
          nasconderla dietro un tocco vorrebbe dire che nessuno la trova. */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-testo-2">
          {righe.length} {righe.length === 1 ? 'movimento' : 'movimenti'}
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
              <span className="text-[15px] font-semibold tracking-[-0.02em]">{g.nome}</span>
              <span className="cifra text-[13px] text-testo-3">{g.righe.length}</span>
              <span className="flex-1" />
              <span
                aria-hidden="true"
                className="shrink-0 text-testo-3 transition-transform duration-150"
                style={{ transform: chiuso ? 'none' : 'rotate(90deg)' }}
              >
                ›
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
                        disabled={occupato}
                        onClick={() => void scrivi({ id: r.id }, r.id)}
                        className={`${BOTTONE} flex-1`}
                      >
                        {inCorso === r.id ? '…' : 'Va bene'}
                      </button>
                      <button
                        type="button"
                        disabled={occupato}
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
                      occupato={occupato}
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
      {righe.length > 1 &&
        (tutteChieste ? (
          <div className="scheda space-y-3 p-4">
            <p className="text-[14px]">
              Approvo la classificazione proposta per tutti e{' '}
              <strong>{righe.length} i movimenti</strong>?
            </p>
            <p className="text-[12px] text-testo-3">
              Restano agganciati al loro esercente: se domani ne cambi la classificazione, la
              seguono. Niente viene inciso.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={occupato}
                className={`${BOTTONE} flex-1`}
                onClick={() => void scrivi({ ids: righe.map((r) => r.id) }, 'tutte')}
              >
                {inCorso === 'tutte' ? '…' : `Sì, approva le ${righe.length}`}
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
          <span className="block text-[15px] font-medium">Pagato oggi e ieri</span>
          <span className="block text-[12px] text-testo-3">
            {righe.length > 0
              ? `${righe.length} ${righe.length === 1 ? 'pagamento' : 'pagamenti'} · ${formattaEuro(totale)}`
              : fermi === null
                ? 'nessun pagamento nelle ultime 24 ore'
                : 'non lo sappiamo: lo scarico dalla banca è fermo'}
          </span>
        </span>
        <span aria-hidden="true" className="shrink-0 text-testo-3">
          ›
        </span>
      </summary>

      {righe.length > 0 && (
        <ul className="elenco pt-2 text-[15px]">
          {righe.map((r) => (
            <li key={r.id}>
              <Link href={`/movimenti/${r.id}`} className="flex min-h-12 items-center gap-3">
                <Avatar
                  nome={r.esercente ?? r.raw_description}
                  misura={30}
                  tinta={
                    r.discrezionalita !== null
                      ? (tinte[r.discrezionalita] ?? 'var(--neutro)')
                      : 'var(--neutro)'
                  }
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{etichettaMovimento(r)}</span>
                  <span className="block truncate text-[12px] text-testo-3">
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
                <span aria-hidden="true" className="shrink-0 text-testo-3">
                  ›
                </span>
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
        <Avatar nome={r.esercente ?? r.raw_description} tinta={tinta ?? 'var(--neutro)'} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[17px] font-semibold">{etichettaMovimento(r)}</span>
          <span className="cifra text-[13px] text-testo-3">{r.booking_date}</span>
        </span>
        <span className="numerone shrink-0 text-[22px]">{euro(r.amount_eur ?? r.amount)}</span>
      </div>

      <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-testo-2">
        <span
          aria-hidden="true"
          className="size-2.5 shrink-0 rounded-full"
          style={{ background: tinta ?? 'var(--neutro)' }}
        />
        <span>{r.categoria ?? 'senza categoria'}</span>
        <span className="text-testo-3">·</span>
        <span>{r.discrezionalita ?? 'non classificato'}</span>
        {r.contesto !== null && (
          <>
            <span className="text-testo-3">·</span>
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
        <div className="nota nota-avviso mt-3 space-y-2 text-[13px]">
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
        <p className="mt-2 text-[12px] text-attenzione">
          Proposta dal modello{r.motivazione !== null && `: ${r.motivazione}`}
        </p>
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
        <span className="text-[12px] text-testo-2">categoria</span>
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
      <p className="mb-3 text-[12px] text-testo-3">
        Si applica appena la scegli. Per <strong>tutte</strong> le spese dell&rsquo;esercente:{' '}
        <Link className="text-accento" href="/revisione">
          revisione
        </Link>
        .
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="text-[12px] text-testo-2">discrezionalità</span>
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
          <span className="text-[12px] text-testo-2">contesto</span>
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
