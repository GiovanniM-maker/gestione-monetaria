import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { leggiUnReport } from '@/lib/report/genera';
import { analizza, pezzi } from '@/lib/report/testo';
import { etichettaMese, meseDaData } from '@/lib/cruscotto/mesi';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Report' };

export default async function UnReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await leggiUnReport(id);
  if (r === null) notFound();

  const blocchi = analizza(r.content_md ?? '');

  return (
    <div className="space-y-6">
      <Link href="/report" className="inline-flex min-h-11 items-center text-sm underline">
        ← tutti i report
      </Link>

      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          {etichettaMese(meseDaData(r.period_start) ?? r.period_start)}
        </h1>
        <p className="mt-1 text-xs text-neutral-500">
          scritto il {r.created_at.slice(0, 10)}
          {r.model !== null && ` da ${r.model}`}
          {r.tokens_used !== null && ` · ${r.tokens_used} token`}
        </p>
      </div>

      <article className="space-y-3">
        {blocchi.map((b, i) => {
          if (b.tipo === 'titolo') {
            return (
              <h2 key={i} className="pt-2 font-medium">
                {b.testo}
              </h2>
            );
          }
          if (b.tipo === 'elenco') {
            return (
              <ul key={i} className="list-disc space-y-1 pl-5 text-sm">
                {b.voci.map((v, j) => (
                  <li key={j}>
                    <Testo contenuto={v} />
                  </li>
                ))}
              </ul>
            );
          }
          return (
            <p key={i} className="text-sm leading-relaxed">
              <Testo contenuto={b.testo} />
            </p>
          );
        })}
      </article>

      {/*
        Gli aggregati che il modello ha ricevuto, testualmente.
        Sono la prova, non un residuo: davanti a una frase che non torna,
        senza di loro non si potrebbe dire se ha sbagliato il modello o il
        calcolo, e le due cose si correggono in posti diversi.
      */}
      <details className="rounded-lg border border-neutral-200 p-3 text-xs dark:border-neutral-800">
        <summary className="cursor-pointer text-neutral-500">I dati esatti che ha ricevuto</summary>
        <pre className="mt-2 overflow-x-auto text-[11px] whitespace-pre-wrap text-neutral-600 dark:text-neutral-400">
          {JSON.stringify(r.metrics, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function Testo({ contenuto }: { contenuto: string }) {
  return (
    <>
      {pezzi(contenuto).map((p, i) =>
        p.forte ? (
          <strong key={i} className="tabular-nums">
            {p.testo}
          </strong>
        ) : (
          <span key={i}>{p.testo}</span>
        ),
      )}
    </>
  );
}
