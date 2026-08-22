'use client';

import { Guasto } from '@/lib/ui/guasto';

/**
 * Il confine d'errore di radice: prende tutto cio' che non ha un confine piu'
 * vicino, comprese le pagine fuori da `(app)`.
 *
 * Non porta la barra in basso ne' il menu, perche' a questo livello il layout
 * dell'applicazione potrebbe essere proprio la cosa che si e' rotta: l'unica
 * uscita che si puo' garantire e' un collegamento.
 */
export default function ErroreDiRadice({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <Guasto error={error} reset={reset} radice />;
}
