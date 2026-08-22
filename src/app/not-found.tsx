import Link from 'next/link';
import { BOTTONE } from '@/lib/ui/controlli';

/**
 * L'indirizzo che non esiste.
 *
 * Capita davvero, e non per errore di battitura: un movimento eliminato, una
 * categoria archiviata, un collegamento vecchio salvato quando l'app era
 * aggiunta alla schermata iniziale. Per questo il testo non dice «pagina non
 * trovata» ma prova a nominare la causa piu' probabile.
 */
export default function NonTrovato() {
  return (
    <div className="mx-auto max-w-md px-5 py-16">
      <div className="space-y-4">
        <p className="eti">Non trovato</p>
        <h1 className="text-[22px] font-bold tracking-[-0.03em]">Qui non c&rsquo;è niente</h1>
        <p className="text-[15px] text-testo-2">
          L&rsquo;indirizzo è giusto ma la cosa che indicava non c&rsquo;è più — un movimento
          rimosso, una categoria archiviata, o un collegamento salvato quando l&rsquo;applicazione
          era fatta in un altro modo.
        </p>
        <div className="pt-1">
          <Link href="/" className={BOTTONE}>
            Torna a Oggi
          </Link>
        </div>
      </div>
    </div>
  );
}
