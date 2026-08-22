'use client';

import Link from 'next/link';
import { BOTTONE, BOTTONE_MINORE } from './controlli';

/**
 * La schermata del guasto.
 *
 * ---------------------------------------------------------------------------
 * Perche' esiste
 * ---------------------------------------------------------------------------
 * Fino al 22 agosto 2026 c'era un solo `error.tsx`, sulla pagina di debug. In
 * ogni altro punto un errore non gestito produceva la schermata predefinita di
 * Next: carattere diverso, lingua inglese, nessuna via d'uscita e nessuna
 * indicazione di cosa restasse valido. Era l'unico schermo dell'applicazione
 * che non fosse stato progettato — ed e' il momento esatto in cui si decide se
 * un prodotto e' serio.
 *
 * ---------------------------------------------------------------------------
 * Tre cose, in quest'ordine
 * ---------------------------------------------------------------------------
 * 1. **Cosa e' successo**, in italiano e senza incolpare nessuno.
 * 2. **Cosa resta vero.** E' la parte che qui conta piu' che altrove: i numeri
 *    che si sono letti un minuto fa non diventano falsi perche' una pagina e'
 *    esplosa. Un utente che non lo sa smette di fidarsi di tutto.
 * 3. **Come uscirne**: riprovare, o tornare al cruscotto.
 *
 * Il messaggio tecnico non sparisce, ma sta sotto un «dettagli»: in produzione
 * React oscura comunque il testo degli errori sollevati sul server e lascia
 * solo un `digest`, che e' la chiave per ritrovarlo nei log di Vercel.
 */
export function Guasto({
  error,
  reset,
  /** Il confine di radice non ha la barra sotto: gli serve un po' piu' d'aria. */
  radice = false,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  radice?: boolean;
}) {
  return (
    <div className={radice ? 'mx-auto max-w-md px-5 py-16' : 'py-10'}>
      <div className="space-y-4">
        <p className="eti">Guasto</p>
        <h1 className="text-[22px] font-bold tracking-[-0.03em]">
          Questa schermata non si è caricata
        </h1>

        <p className="text-[15px] text-testo-2">
          È un errore dell&rsquo;applicazione, non dei tuoi dati.{' '}
          <strong className="text-testo">Nessun movimento è stato toccato</strong>, e i numeri che
          hai letto prima restano quelli giusti: quello che manca è solo questa pagina.
        </p>

        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" onClick={reset} className={BOTTONE}>
            Riprova
          </button>
          <Link href="/" className={BOTTONE_MINORE}>
            Torna a Oggi
          </Link>
        </div>

        <details className="pt-2">
          <summary className="min-h-11 cursor-pointer text-[13px] text-accento">
            dettagli tecnici
          </summary>
          <div className="nota nota-errore mt-2 space-y-2 text-[13px]">
            <p className="break-words">{error.message}</p>
            {error.digest !== undefined && (
              <p>
                Digest: <span className="font-mono">{error.digest}</span>
              </p>
            )}
            <p className="text-testo-2">
              Il testo completo sta nei <strong>Runtime Logs</strong> di Vercel: apri il deployment,
              vai su Logs e cerca il digest.
            </p>
          </div>
        </details>
      </div>
    </div>
  );
}
