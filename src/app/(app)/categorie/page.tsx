import type { Metadata } from 'next';
import { leggiAlbero } from '@/lib/tassonomia/categorie';
import { PannelloCategorie } from './pannello-categorie';
import { conta, TestataPagina } from '../testata';

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
  const radici = albero.filter((c) => c.parent_id === null).length;
  const esercenti = albero.reduce((s, c) => s + (c.esercenti ?? 0), 0);
  const movimenti = albero.reduce((s, c) => s + (c.movimenti ?? 0), 0);

  return (
    <div className="space-y-5">
      <TestataPagina
        titolo="Categorie"
        cifra={conta(albero.length)}
        etichetta={`${conta(radici)} di primo livello`}
        figure={
          senzaConteggi
            ? undefined
            : [
                { valore: conta(esercenti), etichetta: 'esercenti appesi' },
                { valore: conta(movimenti), etichetta: 'movimenti' },
              ]
        }
        perche={
          <p>
            Il <strong>+</strong> di una riga crea una sottocategoria lì dentro, col genitore già
            scelto: è l’unico posto in cui si sa già dove va. Toccando il nome si apre la sua
            scheda, dove si rinomina e si vede quanto pesa nel mese. Eliminare non perde mai niente:
            esercenti, movimenti e figlie passano al genitore.
          </p>
        }
      />
      {senzaConteggi && (
        <p className="nota nota-avviso text-sec">
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
