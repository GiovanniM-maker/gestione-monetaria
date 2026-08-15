import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { leggiMovimento } from '@/lib/movimenti/cerca';
import { centesimiDi, formattaEuro, sommaCosti } from '@/lib/abbonamenti/formato';
import { BOTTONE_MINORE } from '@/lib/ui/controlli';
import { COLORE_CLASSE } from '../../grafici';
import { TestataLivello } from '../../livello';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { comeArray } from '@/lib/enablebanking/redact';
import { SpostaMovimento } from './sposta';
import { CorreggiMovimento } from '../../correggi';
import { esercenteVariabile } from '@/lib/movimenti/classifica';
import { Interruttore } from '../../esercenti/interruttore';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Movimento' };

/**
 * La scheda di un movimento.
 *
 * Nata **in sola lettura**: verificare un numero scomponendolo fino alla riga e
 * leggere la causale grezza di un movimento che non si riconosce. La scrittura
 * era rimandata a quando il bisogno fosse stato misurato invece che ipotizzato
 * (`docs/cruscotto.md` §8).
 *
 * Il bisogno e' arrivato, e uno solo: **spostare la riga su un altro
 * esercente**. Sotto `Apple` convivono undici canoni iCloud da 2,99 e cinque
 * acquisti di aprile per 444,65 €, con la stessa identica causale
 * `apple.com/bill` — nessuna regola sulle stringhe li separa, e finche' stanno
 * insieme il rilevatore dichiara un canone da 44,94 €/mese per un servizio che
 * ne costa 2,99.
 *
 * Con il cruscotto nuovo la correzione e' arrivata **dove si guarda il
 * numero**, quindi anche qui: discrezionalita', contesto e nota di questa
 * riga. Prima si potevano cambiare solo da `/da-confermare`, che pero' mostra
 * soltanto cio' che non e' ancora stato confermato — una riga approvata ieri
 * non era piu' correggibile da nessuna parte. La classificazione di **tutte**
 * le occorrenze resta sulla scheda dell'esercente: ognuna nel posto dove vale
 * la sua portata, e con la portata scritta sopra.
 *
 * Regola 7: l'IBAN resta mascherato, come arriva dal database.
 */
function euro(valore: string | null): string {
  if (valore === null) return '—';
  const { totale, nonLetti } = sommaCosti([valore]);
  return nonLetti > 0 ? '—' : formattaEuro(totale);
}

export default async function MovimentoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = await leggiMovimento(id);
  if (m === null) notFound();

  const supabase = await createSupabaseServerClient();
  const [{ data: albero }, variabile] = await Promise.all([
    supabase.from('v_categorie_albero').select('id, percorso, archiviata').order('percorso'),
    esercenteVariabile(m.merchant_id),
  ]);
  const categorie = comeArray<{ id: string; percorso: string; archiviata: boolean }>(albero)
    .filter((c) => !c.archiviata)
    .map((c) => ({ id: c.id, percorso: c.percorso }));

  return (
    <div className="space-y-6">
      <TestataLivello
        ritorno={{ href: '/movimenti', testo: 'tutti i movimenti' }}
        titolo={m.esercente ?? m.raw_description ?? '(senza descrizione)'}
        sottotitolo={`${m.booking_date}${m.conto === null ? '' : ` · ${m.conto}`}`}
        importo={centesimiDi(m.amount_eur ?? m.amount)}
        tinta={m.discrezionalita === null ? null : (COLORE_CLASSE[m.discrezionalita] ?? null)}
        nota={m.categoria}
        azioni={
          m.merchant_id === null ? undefined : (
            <>
              <Link className={BOTTONE_MINORE} href={`/esercente/${m.merchant_id}`}>
                la scheda di {m.esercente}
              </Link>
              <Link
                className={BOTTONE_MINORE}
                href={`/movimenti?esercente=${m.merchant_id}&tipo=tutti`}
              >
                tutti i suoi movimenti
              </Link>
            </>
          )
        }
      />

      {/* Perche' questa riga non e' nella spesa reale. E' la prima cosa da
          sapere quando si e' arrivati qui perche' un totale non tornava. */}
      {m.fuori_dalla_spesa !== null && (
        <p className="nota nota-avviso text-[14px]">
          Non entra nella spesa reale: <strong>{m.fuori_dalla_spesa}</strong>.
        </p>
      )}

      {m.stato === 'pending' && (
        <p className="nota nota-avviso text-[14px]">
          Movimento <strong>provvisorio</strong>: la banca non l&rsquo;ha ancora contabilizzato.
          L&rsquo;importo pu&ograve; cambiare, e la data di valuta non c&rsquo;&egrave; ancora.
        </p>
      )}

      <Blocco titolo="Classificazione">
        <Voce nome="categoria" valore={m.categoria} />
        <Voce nome="discrezionalità" valore={m.discrezionalita} />
        <Voce nome="contesto" valore={m.contesto} />
        <Voce
          nome="corretto a mano"
          valore={m.manually_categorized ? 'sì — l’automatismo non lo tocca più' : 'no'}
        />
        {m.note !== null && <Voce nome="note" valore={m.note} />}
      </Blocco>

      {/* I campi grezzi sono diagnostica: servono quando una riga non si
          riconosce, cioe' raramente, e aperti sono due terzi della schermata. */}
      <Blocco titolo="Come l’ha mandato la banca" chiuso>
        <Voce nome="causale" valore={m.raw_description} />
        <Voce nome="controparte" valore={m.counterparty_raw} />
        <Voce nome="codice operazione" valore={m.bank_code} />
        <Voce nome="stato" valore={m.stato} />
        <Voce nome="data contabile" valore={m.booking_date} />
        <Voce nome="data valuta" valore={m.value_date} />
        <Voce nome="importo originale" valore={`${m.amount} ${m.currency}`} />
        {m.currency !== 'EUR' && <Voce nome="importo in euro" valore={euro(m.amount_eur)} />}
      </Blocco>

      <Blocco titolo="Esclusioni" chiuso>
        <Voce nome="giroconto" valore={m.is_transfer ? 'sì' : 'no'} />
        <Voce nome="rimborso" valore={m.is_refund ? 'sì' : 'no'} />
        <Voce nome="escluso dall’analisi" valore={m.excluded_from_analysis ? 'sì' : 'no'} />
      </Blocco>

      {/* Il flag dell'esercente sta anche qui, e non solo sulla sua scheda:
          ci si accorge che «Amazon» ospita cose diverse **guardando una sua
          spesa**, non guardando l'elenco degli esercenti. Farlo da qui evita di
          uscire, cambiare, e tornare a cercare la riga. */}
      {m.merchant_id !== null && (
        <section className="space-y-2 scheda p-3">
          <h2 className="text-sm font-medium">{m.esercente ?? 'Questo esercente'}</h2>
          <Interruttore id={m.merchant_id} variabile={variabile} />
        </section>
      )}

      <div className="space-y-3">
        <CorreggiMovimento
          id={m.id}
          categoriaId={m.category_id ?? null}
          discrezionalita={m.discrezionalita}
          contesto={m.contesto}
          note={m.note}
          variabile={variabile}
          categorie={categorie}
        />
        <SpostaMovimento id={m.id} esercenteAttuale={m.esercente} categorie={categorie} />
      </div>

      <p className="text-xs text-testo-2">
        Per cambiare la classificazione di <strong>tutte</strong> le occorrenze di questo esercente
        si passa dalla{' '}
        {m.merchant_id === null ? (
          'sua scheda'
        ) : (
          <Link className="underline" href={`/esercente/${m.merchant_id}`}>
            sua scheda
          </Link>
        )}
        : l&rsquo;effetto arriva anche sui mesi gi&agrave; chiusi.
      </p>
    </div>
  );
}

function Blocco({
  titolo,
  chiuso,
  children,
}: {
  titolo: string;
  /** Sotto un «apri»: vale per cio' che si guarda solo quando qualcosa non torna. */
  chiuso?: boolean;
  children: React.ReactNode;
}) {
  const dentro = <dl className="space-y-1.5 pt-1">{children}</dl>;
  if (chiuso !== true) {
    return (
      <section className="scheda p-4">
        <h2 className="text-[15px] font-medium">{titolo}</h2>
        {dentro}
      </section>
    );
  }
  return (
    <details className="scheda p-4">
      <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-[15px] font-medium">
        {titolo}
        <span aria-hidden="true" className="text-testo-3">
          ›
        </span>
      </summary>
      {dentro}
    </details>
  );
}

function Voce({ nome, valore }: { nome: string; valore: string | null }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 text-[14px]">
      <dt className="text-testo-2">{nome}</dt>
      <dd className="min-w-0 text-right break-words">{valore ?? '—'}</dd>
    </div>
  );
}
