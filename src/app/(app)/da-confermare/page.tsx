import type { Metadata } from 'next';
import { leggiDaConfermare } from '@/lib/conferma/leggi';
import { PannelloConferma } from './pannello-conferma';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Da confermare' };

/**
 * La lista della sera.
 *
 * L'app mostra i movimenti nuovi con la classificazione che ha proposto, e si
 * conferma con un gesto o si corregge. Esiste perche' **l'intento
 * dell'acquisto non sta sull'esercente**: un computer comprato da Euronics per
 * lavorare e' `investimento` e `business`, una sciocchezza comprata nello
 * stesso negozio e' `voluttuario` e `personale`. Nessuna regola sull'esercente
 * puo' distinguerli, e nemmeno un modello: l'informazione non e' nei dati
 * bancari, e' nella testa di chi ha comprato.
 *
 * E si chiede la sera per due ragioni. La memoria dell'intento decade in
 * fretta — a un mese di distanza «89 € da Euronics» non si ricostruisce piu' —
 * e i movimenti di una giornata sono pochi: e' un gesto da trenta secondi, non
 * una sessione di riordino, ed e' la differenza fra una cosa che si fa e una
 * che si rimanda.
 */
export default async function DaConfermarePage() {
  const righe = await leggiDaConfermare();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Da confermare</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          <strong>Va bene</strong> lascia la riga agganciata al suo esercente: se domani cambi la
          classificazione di quell&rsquo;esercente, questa la segue. <strong>Correggi</strong> dice
          che questa spesa fa eccezione, e da l&igrave; in poi nessun automatismo la tocca.
        </p>
      </div>

      <PannelloConferma righe={righe} />
    </div>
  );
}
