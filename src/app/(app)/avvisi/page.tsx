import type { Metadata } from 'next';
import { leggiAvvisi } from '@/lib/avvisi/leggi';
import { PannelloAvvisi } from './pannello-avvisi';
import { conta, TestataPagina } from '../testata';

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
  const aperti = avvisi.filter((a) => a.status !== 'dismissed').length;

  return (
    <div className="space-y-5">
      <TestataPagina
        titolo="Avvisi"
        cifra={conta(aperti)}
        etichetta={aperti === 0 ? 'niente da leggere' : aperti === 1 ? 'da leggere' : 'da leggere'}
        tinta={aperti === 0 ? 'var(--investimento)' : 'var(--utile)'}
        perche={
          <p>
            Solo due cose meritano un avviso: che il <strong>costo ricorrente</strong> sia cambiato,
            e che i numeri abbiano smesso di essere <strong>affidabili</strong>. Tutto il resto è
            rumore, e il rumore in un canale di avvisi non è neutro: spegne il canale. Un avviso
            ignorato non torna.
          </p>
        }
      />

      <PannelloAvvisi avvisi={avvisi} />
    </div>
  );
}
