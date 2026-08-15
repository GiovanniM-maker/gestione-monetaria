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
        <h1 className="text-[22px] font-bold tracking-[-0.03em]">Da confermare</h1>
        {/* La differenza fra i due gesti va detta, ma non sopra le carte a ogni
            apertura: chi apre questa schermata la apre per premere. */}
        <details className="mt-1 text-[13px] text-testo-2">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-testo-3">
            che differenza c&rsquo;&egrave; fra i due bottoni?
          </summary>
          <p className="pb-2">
            <strong className="text-testo">Va bene</strong> lascia la riga agganciata al suo
            esercente: se domani cambi la classificazione di quell&rsquo;esercente, questa la segue.{' '}
            <strong className="text-testo">Correggi</strong> dice che questa spesa fa eccezione, e
            da l&igrave; in poi nessun automatismo la tocca.
          </p>
        </details>
      </div>

      <PannelloConferma righe={righe} />
    </div>
  );
}
