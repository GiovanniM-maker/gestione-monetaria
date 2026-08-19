'use client';

import { usePathname } from 'next/navigation';

/**
 * L'intestazione c'e' solo dove serve.
 *
 * Sulla home e su «Dove» il posto in alto e' della riga del mese: la capsula
 * col mese a sinistra e il menu a destra (`SceltaMese` con `menu`), come fa
 * Revolut con la sua barra di ricerca. Tenere anche questa riga sopra quella
 * sarebbe **due intestazioni**, e la prima direbbe soltanto il nome
 * dell'applicazione — che chi la sta usando sa gia'.
 *
 * L'elenco dei percorsi sta qui e non in un flag passato dalle pagine: un
 * layout non riceve niente dalle pagine che contiene, e' il percorso l'unica
 * cosa che sa. Una pagina nuova con un mese in testa va aggiunta qui.
 */
const SENZA_INTESTAZIONE: readonly string[] = ['/', '/dove'];

export function Intestazione({ children }: { children: React.ReactNode }) {
  const percorso = usePathname();
  if (SENZA_INTESTAZIONE.includes(percorso)) return null;
  return <>{children}</>;
}
