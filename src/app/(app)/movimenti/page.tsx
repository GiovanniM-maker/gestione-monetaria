import type { Metadata } from 'next';
import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { comeArray } from '@/lib/enablebanking/redact';
import { cercaMovimenti } from '@/lib/movimenti/cerca';
import {
  CONTESTI,
  DISCREZIONALITA,
  PER_PAGINA,
  TIPI,
  indirizzo,
  leggiFiltri,
} from '@/lib/movimenti/filtri';
import { formattaEuro, sommaCosti } from '@/lib/abbonamenti/formato';
import { BOTTONE, BOTTONE_MINORE, CAMPO_PIENO } from '@/lib/ui/controlli';
import { SceltaCategoria } from '../scelta-categoria';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Movimenti' };

/**
 * La lista dei movimenti.
 *
 * E' il pavimento dell'applicazione: fino a qui ogni discesa finiva su un
 * aggregato e non c'era modo di vedere di cosa fosse la somma. Un numero da
 * cui non si puo' scendere si puo' solo credere, e alla prima cifra che
 * sorprende si smette di crederlo.
 *
 * I filtri sono un `form method="get"`: nessun JavaScript, la pagina resta un
 * componente server, il tasto indietro funziona e una ricerca si puo' mandare
 * a se' stessi come collegamento. «I ristoranti di marzo» e' un indirizzo.
 */

function centesimi(valore: string | null): bigint | null {
  const { totale, nonLetti } = sommaCosti([valore]);
  return nonLetti > 0 ? null : totale;
}

function euro(valore: string | null): string {
  const c = centesimi(valore);
  return c === null ? '—' : formattaEuro(c);
}

const ETICHETTE_TIPO: Record<string, string> = {
  spesa: 'spese reali',
  entrate: 'entrate',
  giroconti: 'giroconti',
  tutti: 'tutti i movimenti',
};

export default async function MovimentiPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filtri = leggiFiltri(await searchParams);

  const supabase = await createSupabaseServerClient();
  // Gli esercenti variabili si leggono qui e non riga per riga: sono pochi, e
  // servono a sapere **fin dove arriva** il selettore di categoria di ogni riga.
  const [esito, { data: categorie }, { data: variabili }] = await Promise.all([
    cercaMovimenti(filtri),
    supabase.from('v_categorie_albero').select('id, percorso, archiviata').order('percorso'),
    supabase.from('merchants').select('id').eq('classificazione_variabile', true),
  ]);

  const alberoCategorie = comeArray<{ id: string; percorso: string; archiviata: boolean }>(
    categorie,
  ).filter((c) => !c.archiviata);
  const eVariabile = new Set(comeArray<{ id: string }>(variabili).map((m) => m.id));
  const primaDellaPagina = (filtri.pagina - 1) * PER_PAGINA;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Movimenti</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Il totale qui sotto &egrave; quello di{' '}
          <strong>tutto ci&ograve; che &egrave; filtrato</strong>, non della pagina che stai
          leggendo.
        </p>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* I FILTRI                                                          */}
      {/* ---------------------------------------------------------------- */}
      <form method="get" action="/movimenti" className="space-y-2">
        <input
          type="search"
          name="q"
          defaultValue={filtri.ricerca}
          placeholder="cerca fra esercenti e causali"
          className={CAMPO_PIENO}
        />

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <label className="block">
            <span className="text-xs text-neutral-500">dal</span>
            <input type="date" name="da" defaultValue={filtri.da ?? ''} className={CAMPO_PIENO} />
          </label>
          <label className="block">
            <span className="text-xs text-neutral-500">al</span>
            <input type="date" name="a" defaultValue={filtri.a ?? ''} className={CAMPO_PIENO} />
          </label>
          <label className="block">
            <span className="text-xs text-neutral-500">tipo</span>
            <select name="tipo" defaultValue={filtri.tipo} className={CAMPO_PIENO}>
              {TIPI.map((t) => (
                <option key={t} value={t}>
                  {ETICHETTE_TIPO[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-neutral-500">ordine</span>
            <select name="ordine" defaultValue={filtri.ordine} className={CAMPO_PIENO}>
              <option value="data">dal più recente</option>
              <option value="importo">dal più grosso</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-neutral-500">categoria</span>
            <select name="categoria" defaultValue={filtri.categoria ?? ''} className={CAMPO_PIENO}>
              <option value="">tutte</option>
              {alberoCategorie.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.percorso}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-neutral-500">classe</span>
            <select
              name="classe"
              defaultValue={filtri.discrezionalita ?? ''}
              className={CAMPO_PIENO}
            >
              <option value="">tutte</option>
              {DISCREZIONALITA.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-neutral-500">contesto</span>
            <select name="contesto" defaultValue={filtri.contesto ?? ''} className={CAMPO_PIENO}>
              <option value="">tutti</option>
              {CONTESTI.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button type="submit" className={`${BOTTONE} w-full`}>
              Filtra
            </button>
          </div>
        </div>

        {/* L'esercente non ha un selettore: la lista sarebbe di centinaia di
            voci. Ci si arriva toccandolo dal cruscotto o da una riga, e il
            campo nascosto lo tiene mentre si cambiano gli altri filtri. */}
        {filtri.merchant !== null && (
          <input type="hidden" name="esercente" value={filtri.merchant} />
        )}
      </form>

      {/* ---------------------------------------------------------------- */}
      {/* IL TOTALE DI CIO' CHE E' FILTRATO                                 */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-y border-neutral-200 py-3 dark:border-neutral-800">
        <p className="text-2xl font-semibold tabular-nums">{euro(esito.totaleImporto)}</p>
        <p className="text-sm text-neutral-500">
          {esito.totaleRighe} {esito.totaleRighe === 1 ? 'movimento' : 'movimenti'} ·{' '}
          {ETICHETTE_TIPO[filtri.tipo]}
        </p>
        {/* Fuori dalla frase e non dentro: e' un'azione, e un bersaglio alto
            sedici pixel dentro una riga di testo si sbaglia col pollice. */}
        {(filtri.merchant !== null || filtri.categoria !== null || filtri.ricerca !== '') && (
          <Link className={BOTTONE_MINORE} href="/movimenti">
            togli i filtri
          </Link>
        )}
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* LE RIGHE                                                          */}
      {/* ---------------------------------------------------------------- */}
      {esito.righe.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-sm text-neutral-500 dark:border-neutral-700">
          Nessun movimento con questi filtri.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-100 dark:divide-neutral-900">
          {esito.righe.map((r) => (
            <li key={r.id} className="space-y-1 py-1">
              <Link
                href={`/movimenti/${r.id}`}
                className="flex min-h-14 items-center justify-between gap-3 py-1"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm">
                    {r.esercente ?? r.raw_description ?? '(senza descrizione)'}
                  </span>
                  <span className="mt-0.5 block text-xs text-neutral-500">
                    {r.booking_date}
                    {r.categoria !== null && ` · ${r.categoria}`}
                    {r.discrezionalita !== null && ` · ${r.discrezionalita}`}
                  </span>
                  {(r.stato === 'pending' ||
                    r.manually_categorized ||
                    r.fuori_dalla_spesa !== null) && (
                    <span className="mt-1 flex flex-wrap gap-1">
                      {r.stato === 'pending' && <Segno testo="provvisorio" />}
                      {r.manually_categorized && <Segno testo="corretto a mano" />}
                      {r.fuori_dalla_spesa !== null && <Segno testo={r.fuori_dalla_spesa} />}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-right text-sm tabular-nums">
                  {euro(r.amount_eur ?? r.amount)}
                  {r.currency !== 'EUR' && (
                    <span className="block text-xs text-neutral-500">{r.currency}</span>
                  )}
                </span>
              </Link>
              {/* Il selettore cambia **l'esercente** quando e' fisso e **la riga**
                  quando e' variabile, ed e' scritto sotto: e' la stessa scelta
                  che si farebbe entrando, senza entrare. Le righe senza
                  esercente non lo hanno — non c'e' niente a cui appenderla che
                  valga oltre la riga, e per quelle si passa dalla scheda. */}
              {r.merchant_id !== null && (
                <SceltaCategoria
                  ambito={
                    eVariabile.has(r.merchant_id)
                      ? { tipo: 'movimento', movimentoId: r.id }
                      : { tipo: 'esercente', merchantId: r.merchant_id }
                  }
                  categoriaId={r.category_id}
                  categorie={alberoCategorie}
                  etichetta
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* LE PAGINE                                                         */}
      {/* ---------------------------------------------------------------- */}
      {esito.pagine > 1 && (
        <div className="flex items-center justify-between gap-3 text-sm">
          {filtri.pagina > 1 ? (
            <Link
              className="inline-flex min-h-11 items-center underline"
              href={indirizzo(filtri, { pagina: filtri.pagina - 1 })}
            >
              ← precedenti
            </Link>
          ) : (
            <span />
          )}
          <span className="text-xs text-neutral-500">
            {primaDellaPagina + 1}–{Math.min(primaDellaPagina + PER_PAGINA, esito.totaleRighe)} di{' '}
            {esito.totaleRighe}
          </span>
          {filtri.pagina < esito.pagine ? (
            <Link
              className="inline-flex min-h-11 items-center underline"
              href={indirizzo(filtri, { pagina: filtri.pagina + 1 })}
            >
              successivi →
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </div>
  );
}

function Segno({ testo }: { testo: string }) {
  return (
    <span className="rounded border border-neutral-300 px-1.5 py-0.5 text-[10px] text-neutral-500 dark:border-neutral-700">
      {testo}
    </span>
  );
}
