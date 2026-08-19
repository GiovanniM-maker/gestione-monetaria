import type { Metadata } from 'next';
import Link from 'next/link';
import { aiConfigurata } from '@/lib/ai/modello';
import {
  leggiConversazione,
  leggiConversazioni,
  nuovaConversazione,
} from '@/lib/copilota/conversazione';
import type { MessaggioSalvato } from '@/lib/copilota/messaggi';
import { PannelloCopilota } from './pannello-copilota';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Copilota' };

/**
 * La conversazione sta nell'indirizzo, come il mese del cruscotto.
 *
 * `/copilota?c=<uuid>`. La pagina resta un componente server — la storia si
 * legge dal database e non attraversa la rete come stato del browser — e una
 * conversazione si può riaprire, mandarsi a sé stessi, o ritrovare domani dal
 * telefono. Senza l'identificativo si apre l'ultima, che è quasi sempre quella
 * che si vuole.
 */
export default async function CopilotaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parametri = await searchParams;
  const richiesta = typeof parametri['c'] === 'string' ? parametri['c'] : null;

  const conversazioni = await leggiConversazioni();
  const scelta = richiesta ?? conversazioni[0]?.conversazione_id ?? nuovaConversazione();

  const messaggi: readonly MessaggioSalvato[] = conversazioni.some(
    (c) => c.conversazione_id === scelta,
  )
    ? await leggiConversazione(scelta)
    : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="flex items-center gap-2.5 text-[22px] font-bold tracking-[-0.03em]">
          <img
            src="/illustrazioni/chiedi.webp"
            alt=""
            width={30}
            height={30}
            className="drop-shadow-[0_4px_10px_rgb(90_80_224/0.35)]"
          />
          Copilota
        </h1>
        <div className="flex gap-2">
          {messaggi.length > 0 && (
            <Link
              className="inline-flex min-h-11 items-center rounded-full bg-s2 px-3.5 text-[13px] text-testo-2 sm:min-h-9"
              href={`/copilota?c=${nuovaConversazione()}`}
            >
              nuova
            </Link>
          )}
          {conversazioni.length > 1 && (
            <details className="relative">
              <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-full bg-s2 px-3.5 text-[13px] text-testo-2 sm:min-h-9">
                precedenti
              </summary>
              <ul className="absolute right-0 z-10 mt-1 max-h-80 w-72 overflow-y-auto rounded-lg bg-s2 p-1 shadow-lg">
                {conversazioni.map((c) => (
                  <li key={c.conversazione_id}>
                    <Link
                      href={`/copilota?c=${c.conversazione_id}`}
                      className="flex min-h-11 items-center rounded-md px-2 text-xs hover:bg-s3"
                    >
                      <span className="truncate">{c.titolo ?? '(vuota)'}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>

      <details className="text-[13px] text-testo-2">
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-testo-3">
          di che cosa si pu&ograve; fidare?
        </summary>
        <p className="pb-2">
          Chiedi un numero e lo va a <strong>prendere</strong> dal database: non ne calcola nessuno,
          e le cifre che non risultano dai dati letti compaiono marcate sotto il messaggio. Le
          modifiche le <strong>prepara</strong>, e le applichi tu con un tocco — così ogni scrittura
          resta attribuibile a chi l&rsquo;ha voluta.
        </p>
      </details>

      {!aiConfigurata() && (
        <p className="nota nota-avviso text-[14px]">
          <code>OPENROUTER_API_KEY</code> non è impostata su questo ambiente: il copilota non può
          rispondere. I numeri restano tutti visibili dal cruscotto.
        </p>
      )}

      <PannelloCopilota conversazioneId={scelta} iniziali={messaggi} />
    </div>
  );
}
