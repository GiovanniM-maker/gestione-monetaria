'use client';

import { Guasto } from '@/lib/ui/guasto';

/**
 * Il confine d'errore dentro l'applicazione.
 *
 * Sta qui e non solo alla radice perche' cosi' **la navigazione sopravvive**:
 * la barra in basso e il menu restano, e da una schermata rotta si passa a
 * un'altra senza ricaricare. Alla radice non e' possibile — li' potrebbe
 * essersi rotto proprio il layout.
 */
export default function ErroreApp({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <Guasto error={error} reset={reset} />;
}
