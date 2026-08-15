import type { Metadata } from 'next';
import { leggiAlbero } from '@/lib/tassonomia/categorie';
import { PannelloCategorie } from './pannello-categorie';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Categorie' };

/**
 * La tassonomia, dove si aggiunge e si toglie.
 *
 * Fino a ieri si potevano **creare** categorie (`crea_categoria`, 0026) e non
 * correggerle ne' eliminarle — nemmeno da un bottone. E' la regola della Fase 0
 * che si paga ogni volta: se la logica non e' un'operazione nominata, per il
 * copilot non esiste; e qui non esisteva per nessuno.
 *
 * La scheda di una singola categoria resta `/categoria/[id]`, dove si rinomina
 * e si sposta il genitore accanto ai suoi numeri. Qui c'e' l'albero intero,
 * che e' la vista che serve quando la tassonomia si sta costruendo.
 */
export default async function CategoriePage() {
  const albero = await leggiAlbero();
  const senzaConteggi = albero.some((c) => c.esercenti === null);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Categorie</h1>
        <p className="mt-1 text-sm text-testo-2">
          {albero.length} voci. Toccando una categoria si apre la sua scheda, dove si rinomina, si
          sposta e si vede quanto pesa nel mese.
        </p>
      </div>
      {senzaConteggi && (
        <p className="nota nota-avviso text-[13px]">
          Non riesco a leggere <code>v_categorie_uso</code>, quindi accanto a ogni categoria trovi
          un trattino invece di quanti esercenti e movimenti contiene.{' '}
          <strong>Zero sarebbe una risposta</strong>, e sarebbe falsa proprio accanto al bottone che
          elimina. Si sistema eseguendo la migration <code>0039</code>.
        </p>
      )}
      <PannelloCategorie albero={albero} />
    </div>
  );
}
