'use client';

import { useClassi, useClassiSceglibili } from '../classi-note';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formattaEuro, sommaCosti } from '@/lib/abbonamenti/formato';
import type { RigaDaConfermare, RigaRecente } from '@/lib/conferma/leggi';
import { BOTTONE, BOTTONE_MINORE, CAMPO_PIENO } from '@/lib/ui/controlli';
import { tinteDelleClassi } from '../grafici';
import { Foglio } from '../foglio';
import { SceltaCategoria } from '../scelta-categoria';

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
}: {
  righe: readonly RigaDaConfermare[];
  recenti: readonly RigaRecente[];
  /** L'albero, per dare una categoria a una riga che non ce l'ha. */
  categorie: readonly { id: string; percorso: string }[];
}) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [aperta, setAperta] = useState<string | null>(null);
  const [tutteChieste, setTutteChieste] = useState(false);

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
    return (
      <div className="space-y-6">
        <div className="scheda space-y-3 p-6 text-center">
          <p
            className="mx-auto flex size-14 items-center justify-center rounded-full text-[26px] leading-none"
            style={{
              background: 'color-mix(in oklab, var(--conferma) 18%, transparent)',
              color: 'var(--conferma)',
            }}
            aria-hidden="true"
          >
            ✓
          </p>
          <p className="text-[17px] font-semibold">Sei in pari.</p>
          <p className="text-[13px] text-testo-2">
            Tutti i movimenti contabilizzati sono stati visti.
          </p>
          <p className="text-[12px] text-testo-3">
            Quelli ancora <strong>provvisori</strong> non compaiono qui: la banca non li ha
            contabilizzati, l&rsquo;importo pu&ograve; cambiare, e confermarli adesso vorrebbe dire
            riconfermarli dopo.
          </p>
        </div>

        <Ultime24Ore righe={recenti} />
      </div>
    );
  }

  const occupato = inCorso !== null;

  return (
    <div className="space-y-3">
      {errore !== null && <p className="nota nota-errore text-[14px]">{errore}</p>}

      <p className="text-[13px] text-testo-2">
        {righe.length} {righe.length === 1 ? 'movimento' : 'movimenti'}
      </p>

      <ul className="space-y-3">
        {righe.map((r) => (
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

            {/* La correzione sale dal basso invece di aprirsi dentro la carta:
                aperta in linea spingeva giu' tutte le altre e la riga che si
                stava guardando finiva fuori schermo. */}
            <Correzione
              riga={r}
              aperta={aperta === r.id}
              occupato={occupato}
              onAnnulla={() => setAperta(null)}
              onSalva={(corpo) => void scrivi({ id: r.id, ...corpo }, r.id)}
            />
          </li>
        ))}
      </ul>

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
        <Ultime24Ore righe={recenti} />
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
 */
function Ultime24Ore({ righe }: { righe: readonly RigaRecente[] }) {
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
            {righe.length === 0
              ? 'nessun pagamento nelle ultime 24 ore'
              : `${righe.length} ${righe.length === 1 ? 'pagamento' : 'pagamenti'} · ${formattaEuro(totale)}`}
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
                <span className="min-w-0 flex-1">
                  <span className="block truncate">
                    {r.esercente ?? r.raw_description ?? '(senza descrizione)'}
                  </span>
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
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[17px] font-semibold">
            {r.esercente ?? r.raw_description ?? '(senza descrizione)'}
          </span>
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
  aperta,
  occupato,
  onAnnulla,
  onSalva,
}: {
  riga: RigaDaConfermare;
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
      <p className="mb-3 text-[12px] text-testo-3">
        La categoria resta quella dell&rsquo;esercente: si cambia da{' '}
        <Link className="text-accento" href="/revisione">
          revisione
        </Link>
        , dove vale per tutte le sue occorrenze.
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
