import type { Metadata } from 'next';
import { leggiAbbonamenti, leggiRiepilogo } from '@/lib/abbonamenti/rileva';
import { PannelloAbbonamenti } from './pannello-abbonamenti';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Abbonamenti' };

/**
 * La schermata della Fase 5.
 *
 * In cima non c'e' l'elenco degli abbonamenti: c'e' **il numero**. Costo
 * ricorrente mensile per classe di discrezionalita' e' la sola metrica per cui
 * questa applicazione esiste, e tutto il resto della pagina serve a poterle
 * credere — quali abbonamenti la compongono, e cosa e' rimasto fuori.
 *
 * Subito sotto la metrica c'e' cosa esclude e perche'. Una cifra che scarta
 * righe senza dire quante ne scarta non e' verificabile, ed e' esattamente il
 * genere di numero che si smette di guardare dopo la prima sorpresa.
 */
export default async function AbbonamentiPage() {
  const [abbonamenti, riepilogo] = await Promise.all([leggiAbbonamenti(), leggiRiepilogo()]);

  const oggi = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Costo ricorrente</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Quanto costa al mese ci&ograve; che si ripete, diviso per classe di discrezionalit&agrave;.
          In due numeri e non in uno: gli <strong>abbonamenti</strong> si disdicono, le{' '}
          <strong>abitudini</strong> si cambiano, e sommarli nasconderebbe quale delle due azioni
          &egrave; possibile.
        </p>
      </div>

      <PannelloAbbonamenti
        abbonamenti={abbonamenti}
        metrica={riepilogo.metrica}
        escluse={riepilogo.escluse}
        nellaMetrica={riepilogo.nellaMetrica}
        totali={riepilogo.totali}
        oggi={oggi}
      />
    </div>
  );
}
