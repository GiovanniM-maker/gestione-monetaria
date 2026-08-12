import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { leggiMovimento } from '@/lib/movimenti/cerca';
import { formattaEuro, sommaCosti } from '@/lib/abbonamenti/formato';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Movimento' };

/**
 * La scheda di un movimento, **in sola lettura**.
 *
 * Serve gia' a due cose senza poter scrivere niente: verificare un numero
 * scomponendolo fino alla riga, e leggere la causale grezza di un movimento
 * che non si riconosce. La terza — correggerlo — ha un costo di progettazione
 * alto e un bisogno ancora misurato a zero: si aggiunge quando si sara' visto
 * quante volte la si sarebbe voluta usare, invece di indovinare adesso
 * (`docs/cruscotto.md` §8).
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

  return (
    <div className="space-y-6">
      <Link href="/movimenti" className="inline-flex min-h-11 items-center text-sm underline">
        ← tutti i movimenti
      </Link>

      <div>
        <p className="text-3xl font-semibold tabular-nums">{euro(m.amount_eur ?? m.amount)}</p>
        <h1 className="mt-1 text-lg">
          {m.esercente ?? m.raw_description ?? '(senza descrizione)'}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          {m.booking_date}
          {m.conto !== null && ` · ${m.conto}`}
        </p>
      </div>

      {/* Perche' questa riga non e' nella spesa reale. E' la prima cosa da
          sapere quando si e' arrivati qui perche' un totale non tornava. */}
      {m.fuori_dalla_spesa !== null && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Non entra nella spesa reale: <strong>{m.fuori_dalla_spesa}</strong>.
        </p>
      )}

      {m.stato === 'pending' && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
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
        {m.merchant_id !== null && (
          <div className="pt-1">
            <Link
              className="inline-flex min-h-11 items-center text-sm underline"
              href={`/movimenti?esercente=${m.merchant_id}&tipo=tutti`}
            >
              tutti i movimenti di {m.esercente} →
            </Link>
          </div>
        )}
      </Blocco>

      <Blocco titolo="Come l’ha mandato la banca">
        <Voce nome="causale" valore={m.raw_description} />
        <Voce nome="controparte" valore={m.counterparty_raw} />
        <Voce nome="codice operazione" valore={m.bank_code} />
        <Voce nome="stato" valore={m.stato} />
        <Voce nome="data contabile" valore={m.booking_date} />
        <Voce nome="data valuta" valore={m.value_date} />
        <Voce nome="importo originale" valore={`${m.amount} ${m.currency}`} />
        {m.currency !== 'EUR' && <Voce nome="importo in euro" valore={euro(m.amount_eur)} />}
      </Blocco>

      <Blocco titolo="Esclusioni">
        <Voce nome="giroconto" valore={m.is_transfer ? 'sì' : 'no'} />
        <Voce nome="rimborso" valore={m.is_refund ? 'sì' : 'no'} />
        <Voce nome="escluso dall’analisi" valore={m.excluded_from_analysis ? 'sì' : 'no'} />
      </Blocco>

      <p className="text-xs text-neutral-500">
        Questa scheda &egrave; in sola lettura. Per cambiare la classificazione di{' '}
        <strong>tutte</strong> le occorrenze di un esercente si passa da{' '}
        <Link className="underline" href="/revisione">
          revisione
        </Link>
        , dove l&rsquo;assegnazione crea un alias e vale anche per il futuro.
      </p>
    </div>
  );
}

function Blocco({ titolo, children }: { titolo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
      <h2 className="mb-2 text-sm font-medium">{titolo}</h2>
      <dl className="space-y-1">{children}</dl>
    </section>
  );
}

function Voce({ nome, valore }: { nome: string; valore: string | null }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 text-sm">
      <dt className="text-neutral-500">{nome}</dt>
      <dd className="min-w-0 text-right break-words">{valore ?? '—'}</dd>
    </div>
  );
}
