import type { Metadata } from 'next';
import Link from 'next/link';
import { leggiReport } from '@/lib/report/genera';
import { etichettaMese, meseDaData } from '@/lib/cruscotto/mesi';
import { GeneraReport } from './genera-report';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Report' };

export default async function ReportPage() {
  const report = await leggiReport();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Report mensili</h1>
        <p className="mt-1 text-sm text-testo-2">
          Le cifre le calcola il database, il modello scrive solo le frasi intorno. Gli aggregati
          esatti che ha ricevuto restano salvati: se una frase non torna, si può dire se ha
          sbagliato il modello o il calcolo.
        </p>
      </div>

      <GeneraReport />

      {report.length === 0 ? (
        <p className="rounded-lg border border-dashed border-filo p-6 text-sm text-testo-2">
          Nessun report. Il primo si genera qui sopra, o arriva da solo il primo del mese.
        </p>
      ) : (
        <ul className="divide-y divide-filo">
          {report.map((r) => (
            <li key={r.id}>
              <Link
                href={`/report/${r.id}`}
                className="flex min-h-14 items-center justify-between gap-3 py-2"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium">
                    {etichettaMese(meseDaData(r.period_start) ?? r.period_start)}
                  </span>
                  <span className="text-xs text-testo-2">
                    scritto il {r.created_at.slice(0, 10)}
                    {r.model !== null && ` · ${r.model}`}
                  </span>
                </span>
                <span className="shrink-0 text-testo-2">→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
