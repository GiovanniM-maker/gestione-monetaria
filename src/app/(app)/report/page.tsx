import type { Metadata } from 'next';
import Link from 'next/link';
import { leggiReport } from '@/lib/report/genera';
import { etichettaMese, meseDaData } from '@/lib/cruscotto/mesi';
import { GeneraReport } from './genera-report';
import { conta, TestataPagina } from '../testata';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Report' };

export default async function ReportPage() {
  const report = await leggiReport();
  const ultimo = report[0]?.period_start ?? null;

  return (
    <div className="space-y-5">
      <TestataPagina
        illustrazione="/illustrazioni/report.webp"
        titolo="Report mensili"
        cifra={conta(report.length)}
        etichetta={
          ultimo === null
            ? 'nessuno ancora'
            : `l’ultimo è ${etichettaMese(meseDaData(ultimo) ?? ultimo)}`
        }
        perche={
          <p>
            Le cifre le calcola il database, il modello scrive solo le frasi intorno — non riceve
            righe da cui calcolare, riceve <strong>aggregati finiti</strong>. E quelli restano
            salvati: se fra sei mesi una frase non torna, si può dire se ha sbagliato il modello o
            il calcolo. Le due cose si correggono in posti diversi.
          </p>
        }
      />

      <GeneraReport />

      {report.length === 0 ? (
        <p className="scheda p-6 text-center text-[14px] text-testo-2">
          Nessun report. Il primo si genera qui sopra, o arriva da solo il primo del mese.
        </p>
      ) : (
        <ul className="scheda elenco px-4">
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
