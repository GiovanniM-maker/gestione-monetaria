import type { Metadata } from 'next';
import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { comeArray } from '@/lib/enablebanking/redact';
import { cercaMovimenti } from '@/lib/movimenti/cerca';
import { etichettaMovimento } from '@/lib/movimenti/etichetta';
import {
  CATEGORIA_SENZA,
  CLASSE_NON_CLASSIFICATA,
  CONTESTI,
  PER_PAGINA,
  TIPI,
  descriviFiltri,
  filtriAttivi,
  indirizzo,
  leggiFiltri,
} from '@/lib/movimenti/filtri';
import { formattaEuro, sommaCosti } from '@/lib/abbonamenti/formato';
import { categorieSceglibili } from '@/lib/tassonomia/categorie';
import { leggiClassi } from '@/lib/tassonomia/classi';
import { BOTTONE, BOTTONE_MINORE, CAMPO_PIENO } from '@/lib/ui/controlli';
import { Avatar } from '@/lib/ui/tessera';
import { tinteDelleClassi } from '../grafici';
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
  const [esito, alberoCategorie, { data: variabili }, classi] = await Promise.all([
    cercaMovimenti(filtri),
    categorieSceglibili(),
    supabase.from('merchants').select('id').eq('classificazione_variabile', true),
    leggiClassi(),
  ]);

  const eVariabile = new Set(comeArray<{ id: string }>(variabili).map((m) => m.id));
  const tinte = tinteDelleClassi(classi);
  const primaDellaPagina = (filtri.pagina - 1) * PER_PAGINA;

  // I due nomi del riassunto senza una query in piu': la categoria sta
  // nell'albero appena letto, e l'esercente — quando e' lui il filtro — e'
  // quello di ogni riga, quindi basta la prima. Se non ce ne sono resta «un
  // esercente», che e' vero: non sappiamo come si chiama.
  const attivi = filtriAttivi(filtri);
  const descrizione = descriviFiltri(filtri, {
    categoria: alberoCategorie.find((c) => c.id === filtri.categoria)?.percorso ?? null,
    esercente: esito.righe[0]?.esercente ?? null,
    // Il nome e non lo slug: dopo un rinomina la riga che descrive i filtri
    // direbbe una parola che nel selettore accanto non compare piu'.
    classe: classi.find((c) => c.slug === filtri.discrezionalita)?.nome ?? null,
  });

  return (
    <div className="space-y-5">
      <h1 className="text-[22px] font-bold tracking-[-0.03em]">Movimenti</h1>

      {/* ---------------------------------------------------------------- */}
      {/* IL TOTALE DI CIO' CHE E' FILTRATO                                 */}
      {/* ---------------------------------------------------------------- */}
      {/* In cima e non sotto i filtri: e' la risposta, e prima stava sotto
          sette controlli, cioe' sotto il bordo dello schermo. */}
      <div className="scheda space-y-2 p-5">
        <p className="numerone text-[34px]">{euro(esito.totaleImporto)}</p>
        <p className="text-[13px] text-testo-2">
          {esito.totaleRighe} {esito.totaleRighe === 1 ? 'movimento' : 'movimenti'} — il totale di
          tutto ci&ograve; che &egrave; filtrato, non della pagina che stai leggendo.
        </p>
        <p className="flex flex-wrap gap-1.5 pt-1">
          {descrizione.map((d) => (
            <span key={d} className="rounded-full bg-s3 px-2.5 py-1 text-[12px] text-testo-2">
              {d}
            </span>
          ))}
        </p>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* I FILTRI                                                          */}
      {/* ---------------------------------------------------------------- */}
      <details className="scheda p-4">
        <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-[15px] font-medium">
          Filtra
          <span aria-hidden="true" className="text-testo-3">
            ›
          </span>
        </summary>
        <form method="get" action="/movimenti" className="space-y-2 pt-3">
          <input
            type="search"
            name="q"
            defaultValue={filtri.ricerca}
            placeholder="cerca fra esercenti e causali"
            className={CAMPO_PIENO}
          />

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <label className="block">
              <span className="text-xs text-testo-2">dal</span>
              <input type="date" name="da" defaultValue={filtri.da ?? ''} className={CAMPO_PIENO} />
            </label>
            <label className="block">
              <span className="text-xs text-testo-2">al</span>
              <input type="date" name="a" defaultValue={filtri.a ?? ''} className={CAMPO_PIENO} />
            </label>
            <label className="block">
              <span className="text-xs text-testo-2">tipo</span>
              <select name="tipo" defaultValue={filtri.tipo} className={CAMPO_PIENO}>
                {TIPI.map((t) => (
                  <option key={t} value={t}>
                    {ETICHETTE_TIPO[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-testo-2">ordine</span>
              <select name="ordine" defaultValue={filtri.ordine} className={CAMPO_PIENO}>
                <option value="data">dal più recente</option>
                <option value="importo">dal più grosso</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-testo-2">categoria</span>
              <select
                name="categoria"
                defaultValue={filtri.categoria ?? ''}
                className={CAMPO_PIENO}
              >
                <option value="">tutte</option>
                {/* «Nessuna» non e' una voce dell'albero, ma e' spesa vera e
                    deve essere chiedibile da qui come dal cruscotto. */}
                <option value={CATEGORIA_SENZA}>senza categoria</option>
                {alberoCategorie.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.percorso}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-testo-2">classe</span>
              <select
                name="classe"
                defaultValue={filtri.discrezionalita ?? ''}
                className={CAMPO_PIENO}
              >
                <option value="">tutte</option>
                {classi
                  .filter((c) => !c.is_archived)
                  .map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.nome}
                    </option>
                  ))}
                {/* La pseudo-classe: nei dati e' un null, ma e' spesa vera e
                    deve avere una voce, o dal cruscotto si arriverebbe a un
                    filtro che il selettore non sa mostrare. */}
                <option value={CLASSE_NON_CLASSIFICATA}>non classificato</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-testo-2">contesto</span>
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

        {/* Fuori dal modulo e non dentro: non e' un filtro, e' toglierli
            tutti. Un bersaglio alto sedici pixel dentro una riga di testo si
            sbaglia col pollice, quindi e' un bottone. */}
        {attivi && (
          <Link className={`${BOTTONE_MINORE} mt-2 w-full`} href="/movimenti">
            togli i filtri
          </Link>
        )}
      </details>

      {/* ---------------------------------------------------------------- */}
      {/* LE RIGHE                                                          */}
      {/* ---------------------------------------------------------------- */}
      {esito.righe.length === 0 ? (
        <p className="scheda p-6 text-center text-[14px] text-testo-2">
          Nessun movimento con questi filtri.
        </p>
      ) : (
        <ul className="scheda elenco px-4">
          {esito.righe.map((r) => (
            <li key={r.id} className="py-1">
              <Link
                href={`/movimenti/${r.id}`}
                className="flex min-h-14 items-center justify-between gap-3 py-1"
              >
                {/* L'iniziale sulla velatura della classe della riga: si
                    riconosce l'esercente scorrendo, prima di leggere. */}
                <Avatar
                  nome={etichettaMovimento(r)}
                  tinta={
                    r.discrezionalita !== null
                      ? (tinte[r.discrezionalita] ?? 'var(--neutro)')
                      : 'var(--neutro)'
                  }
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px]">{etichettaMovimento(r)}</span>
                  <span className="mt-0.5 block text-[12px] text-testo-3">
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
                <span className="cifra shrink-0 text-right text-[15px]">
                  {euro(r.amount_eur ?? r.amount)}
                  {r.currency !== 'EUR' && (
                    <span className="block text-[12px] text-testo-3">{r.currency}</span>
                  )}
                </span>
              </Link>
              {/* Il selettore cambia **l'esercente** quando e' fisso e **la riga**
                  quando e' variabile, ed e' scritto sotto: e' la stessa scelta
                  che si farebbe entrando, senza entrare.

                  Le righe **senza esercente** ce l'hanno anch'esse, e valgono
                  per se stesse: sono i bonifici a un privato, che non hanno
                  nessuna sede piu' larga dove essere classificati. Prima
                  restavano fuori — «per quelle si passa dalla scheda» — ma la
                  scheda non lo permetteva, quindi non c'era nessuna strada. */}
              <SceltaCategoria
                ambito={
                  r.merchant_id === null || eVariabile.has(r.merchant_id)
                    ? { tipo: 'movimento', movimentoId: r.id }
                    : { tipo: 'esercente', merchantId: r.merchant_id }
                }
                categoriaId={r.category_id}
                categorie={alberoCategorie}
                etichetta
              />
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
          <span className="text-xs text-testo-2">
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
    <span className="rounded border border-filo px-1.5 py-0.5 text-[10px] text-testo-2">
      {testo}
    </span>
  );
}
