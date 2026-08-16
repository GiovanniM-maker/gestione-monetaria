import type { Metadata } from 'next';
import { leggiClassi } from '@/lib/tassonomia/classi';
import { PannelloClassi } from './pannello-classi';
import { conta, TestataPagina } from '../testata';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Classi' };

/**
 * Le classi di discrezionalita', dove si creano e si tolgono.
 *
 * Erano quattro parole in un `check` su tre colonne, piu' cinque copie della
 * stessa lista dentro altrettante funzioni SQL e nove componenti che se la
 * riscrivevano dentro. Dalla `0043` sono righe di una tabella, e questa e' la
 * schermata che le governa — come `/categorie` per la tassonomia, e nello
 * stesso posto: il menu della manutenzione, non le quattro schede.
 *
 * ---------------------------------------------------------------------------
 * Perche' `nel_ricorrente` sta qui e non in un'impostazione
 * ---------------------------------------------------------------------------
 * La metrica per cui questa applicazione esiste e' il costo ricorrente mensile
 * **per classe**: una riga per classe, non un numero. Passare da quattro a
 * sette classi non la rompe, la allunga. Quello che si rompe e' il **totale**,
 * ed e' gia' cosi' con quattro: somma cose che si potrebbero smettere di pagare
 * e cose che non si smetteranno mai — l'affitto sta dentro quella cifra.
 *
 * Il flag decide chi entra nella somma, non chi entra nella ripartizione. Le
 * classi escluse restano visibili sotto la linea, col loro subtotale: un euro
 * fuori da un totale deve lasciare una traccia, ed e' la stessa regola di
 * `senza_cambio` e di `v_ricorrenze_escluse`.
 *
 * E' dichiarato, non calcolato. Nessun numero distingue un costo che vuoi
 * togliere da uno che vuoi tenere — sta nella testa di chi paga, esattamente
 * come `is_subscription` sull'esercente.
 */
export default async function ClassiPage() {
  const classi = await leggiClassi();
  const nelTotale = classi.filter((c) => c.nel_ricorrente && !c.is_archived).length;
  const attive = classi.filter((c) => !c.is_archived).length;

  return (
    <div className="space-y-5">
      <TestataPagina
        titolo="Classi"
        cifra={conta(attive)}
        etichetta={attive === 1 ? 'classe in uso' : 'classi in uso'}
        figure={[
          { valore: conta(nelTotale), etichetta: 'nel totale ricorrente' },
          { valore: conta(attive - nelTotale), etichetta: 'sotto la linea' },
        ]}
        perche={
          <>
            <p>
              La <strong>discrezionalità</strong> è la dimensione su cui l’applicazione calcola il
              costo ricorrente mensile, che è la sola metrica per cui esiste. Vive sull’esercente e
              si propaga a tutte le sue spese: si risponde «Deliveroo è voluttuario» una volta
              invece che su cinquantanove righe.
            </p>
            <p>
              <strong>Nel totale</strong> non toglie niente da nessuna parte: la classe resta nella
              ripartizione, col suo colore e il suo numero, e smette solo di essere sommata nella
              cifra in cima. Serve per il ricorrente che non si vuole togliere — un risparmio, le
              tasse, una rata — perché un totale che mescola «quanto potrei smettere di pagare» con
              «quanto continuerò a pagare comunque» non risponde a nessuna domanda.
            </p>
            <p>
              Rinominare non riscrive nessuna spesa: il nome mostrato e l’identificativo interno
              sono due cose diverse, come per le categorie. <strong>Archiviare</strong> toglie una
              classe dai selettori lasciando intatto lo storico; <strong>eliminare</strong> chiede
              dove spostare le sue righe, ed è anche il modo di unire due classi.
            </p>
          </>
        }
      />
      <PannelloClassi classi={classi} />
    </div>
  );
}
