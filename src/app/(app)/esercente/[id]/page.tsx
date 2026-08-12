import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { comeArray } from '@/lib/enablebanking/redact';
import { formattaEuro, sommaCosti } from '@/lib/abbonamenti/formato';
import { etichettaBreve, meseDaData, quotaPercentuale } from '@/lib/cruscotto/mesi';
import { BOTTONE_MINORE } from '@/lib/ui/controlli';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Esercente' };

/**
 * La scheda di un esercente.
 *
 * Risponde a «quanto mi costa Deliveroo», che e' una domanda che ci si fa
 * davvero e che finora richiedeva una query scritta a mano.
 *
 * Mostra anche **da dove viene la classificazione** — un alias, una proposta
 * del modello, o una decisione presa a mano — perche' una categoria sbagliata
 * si corregge solo se si sa chi l'ha messa. Le proposte del modello nascono
 * con `origine = 'ai'` e valgono subito, ma restano da confermare: qui si vede
 * quali.
 */

type Mensile = { mese: string; spesa: string; movimenti: number };

type Esercente = {
  id: string;
  canonical_name: string;
  category_id: string | null;
  discretion: string | null;
  context: string | null;
  is_subscription: boolean;
  origine: string | null;
  confermato_at: string | null;
  motivazione: string | null;
  movimenti: number;
  totale: string;
  ultima: string | null;
};

function centesimi(valore: string | null): bigint {
  const { totale, nonLetti } = sommaCosti([valore]);
  return nonLetti > 0 ? 0n : totale;
}

const ORIGINI: Record<string, string> = {
  alias: 'da un alias deterministico',
  ai: 'proposta dal modello, non ancora confermata',
  manuale: 'decisa a mano',
};

export default async function EsercentePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const [{ data: riga }, { data: mensili }, { data: categorie }, { data: ricorrenza }] =
    await Promise.all([
      supabase
        .from('v_merchant_totals')
        .select(
          'id, canonical_name, category_id, discretion, context, is_subscription, origine, ' +
            'confermato_at, motivazione, movimenti, totale::text, ultima',
        )
        .eq('id', id)
        .maybeSingle(),
      supabase
        .from('v_monthly_by_merchant')
        .select('mese, spesa::text, movimenti')
        .eq('merchant_id', id)
        .order('mese', { ascending: false })
        .limit(18),
      supabase.from('categories').select('id, name'),
      supabase
        .from('v_subscriptions')
        .select('id, tipo, cadence, costo_mensile::text, nella_metrica, status')
        .eq('merchant_id', id)
        .maybeSingle(),
    ]);

  const m = riga as Esercente | null;
  if (m === null) notFound();

  const mesi = comeArray<Mensile>(mensili).map((r) => ({
    ...r,
    mese: meseDaData(r.mese) ?? r.mese,
  }));
  const massimo = mesi.reduce((max, r) => {
    const v = centesimi(r.spesa);
    return v < max ? v : max;
  }, 0n);

  const categoria =
    comeArray<{ id: string; name: string }>(categorie).find((c) => c.id === m.category_id) ?? null;

  return (
    <div className="space-y-6">
      <Link href="/" className="inline-flex min-h-11 items-center text-sm underline">
        ← cruscotto
      </Link>

      <div>
        <h1 className="text-xl font-semibold tracking-tight">{m.canonical_name}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {m.movimenti} {m.movimenti === 1 ? 'movimento' : 'movimenti'}
          {m.ultima !== null && ` · ultimo il ${m.ultima}`}
        </p>
        <p className="mt-2 text-3xl font-semibold tabular-nums">
          {formattaEuro(centesimi(m.totale))}
        </p>
        <p className="text-xs text-neutral-500">speso in tutto lo storico</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link className={BOTTONE_MINORE} href={`/movimenti?esercente=${m.id}&tipo=tutti`}>
          tutti i movimenti
        </Link>
        <Link className={BOTTONE_MINORE} href="/revisione">
          cambia la classificazione
        </Link>
      </div>

      <section className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
        <h2 className="mb-2 text-sm font-medium">Classificazione</h2>
        <dl className="space-y-1 text-sm">
          <Voce nome="categoria" valore={categoria?.name ?? null} />
          <Voce nome="discrezionalità" valore={m.discretion} />
          <Voce nome="contesto" valore={m.context} />
          <Voce nome="abbonamento" valore={m.is_subscription ? 'sì' : 'no'} />
          <Voce nome="origine" valore={ORIGINI[m.origine ?? ''] ?? m.origine} />
        </dl>
        {m.motivazione !== null && (
          <p className="mt-2 border-t border-neutral-100 pt-2 text-xs text-neutral-500 dark:border-neutral-900">
            {m.motivazione}
          </p>
        )}
        {m.origine === 'ai' && m.confermato_at === null && (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
            Questa classificazione l&rsquo;ha proposta il modello e nessuno l&rsquo;ha ancora
            confermata. Vale per i conteggi — una classificazione probabile e visibile è più utile
            di nessuna — ma è la prima da guardare se un totale sorprende.
          </p>
        )}
      </section>

      {ricorrenza !== null && (
        <section className="rounded-lg border border-neutral-200 p-3 text-sm dark:border-neutral-800">
          <h2 className="mb-2 text-sm font-medium">Ricorrenza</h2>
          <p>
            Rilevata come <strong>{(ricorrenza as { tipo: string }).tipo}</strong>, cadenza{' '}
            {(ricorrenza as { cadence: string }).cadence}, costo mensile{' '}
            <strong className="tabular-nums">
              {formattaEuro(centesimi((ricorrenza as { costo_mensile: string }).costo_mensile))}
            </strong>
            .{' '}
            {(ricorrenza as { nella_metrica: boolean }).nella_metrica
              ? 'Entra nel costo ricorrente.'
              : 'Non entra nel costo ricorrente.'}
          </p>
          <Link className="mt-2 inline-flex min-h-11 items-center underline" href="/abbonamenti">
            vedi tutte le ricorrenze →
          </Link>
        </section>
      )}

      {mesi.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium">Mese per mese</h2>
          <ul className="space-y-1">
            {mesi.map((r) => {
              const valore = centesimi(r.spesa);
              return (
                <li key={r.mese}>
                  <Link
                    href={`/?mese=${r.mese}`}
                    className="flex min-h-11 items-center gap-3 text-sm sm:min-h-0 sm:py-0.5"
                  >
                    <span className="w-12 shrink-0 text-xs text-neutral-500 sm:w-16">
                      {etichettaBreve(r.mese)}
                    </span>
                    <span className="h-3 flex-1 overflow-hidden rounded-sm bg-neutral-100 dark:bg-neutral-900">
                      <span
                        className="block h-full bg-neutral-400 dark:bg-neutral-600"
                        style={{ width: `${quotaPercentuale(valore, massimo)}%` }}
                      />
                    </span>
                    <span className="w-24 shrink-0 text-right text-xs tabular-nums sm:w-28">
                      {formattaEuro(valore)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

function Voce({ nome, valore }: { nome: string; valore: string | null }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4">
      <dt className="text-neutral-500">{nome}</dt>
      <dd className="text-right">{valore ?? '—'}</dd>
    </div>
  );
}
