import type { Metadata } from 'next';
import { leggiAvvisi } from '@/lib/avvisi/leggi';
import { PannelloAvvisi } from './pannello-avvisi';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Avvisi' };

/**
 * Gli avvisi.
 *
 * Ne vale la pena solo per due cose: **il costo ricorrente è cambiato** — un
 * canone è aumentato, ne è comparso uno nuovo, uno che hai dichiarato di non
 * usare si paga ancora — e **il numero non è più affidabile**, cioè il consenso
 * sta scadendo o la sincronizzazione fallisce.
 *
 * Tutto il resto è rumore, e il rumore in un canale di avvisi non è neutro:
 * spegne il canale.
 */
export default async function AvvisiPage() {
  const avvisi = await leggiAvvisi();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-bold tracking-[-0.03em]">Avvisi</h1>
        <p className="mt-1 text-[13px] text-testo-2">
          Solo due cose meritano un avviso: che il costo ricorrente sia cambiato, e che i numeri
          abbiano smesso di essere affidabili. Un avviso ignorato non torna.
        </p>
      </div>

      <PannelloAvvisi avvisi={avvisi} />
    </div>
  );
}
