import type { Metadata } from 'next';
import { leggiDaConfermare } from '@/lib/conferma/leggi';
import { PannelloConferma } from './pannello-conferma';
import { centesimiDi, formattaEuro } from '@/lib/abbonamenti/formato';
import { conta, TestataPagina } from '../testata';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Da confermare' };

/**
 * La lista della sera.
 *
 * L'app mostra i movimenti nuovi con la classificazione che ha proposto, e si
 * conferma con un gesto o si corregge. Esiste perche' **l'intento
 * dell'acquisto non sta sull'esercente**: un computer comprato da Euronics per
 * lavorare e' `investimento` e `business`, una sciocchezza comprata nello
 * stesso negozio e' `voluttuario` e `personale`. Nessuna regola sull'esercente
 * puo' distinguerli, e nemmeno un modello: l'informazione non e' nei dati
 * bancari, e' nella testa di chi ha comprato.
 *
 * E si chiede la sera per due ragioni. La memoria dell'intento decade in
 * fretta — a un mese di distanza «89 € da Euronics» non si ricostruisce piu' —
 * e i movimenti di una giornata sono pochi: e' un gesto da trenta secondi, non
 * una sessione di riordino, ed e' la differenza fra una cosa che si fa e una
 * che si rimanda.
 */
export default async function DaConfermarePage() {
  const righe = await leggiDaConfermare();
  const valgono = righe.reduce((s, r) => s + centesimiDi(r.amount_eur ?? r.amount), 0n);

  return (
    <div className="space-y-5">
      <TestataPagina
        titolo="Da confermare"
        cifra={conta(righe.length)}
        etichetta={righe.length === 0 ? 'sei in pari' : 'movimenti nuovi'}
        tinta={righe.length === 0 ? 'var(--investimento)' : null}
        figure={
          righe.length === 0 ? undefined : [{ valore: formattaEuro(valgono), etichetta: 'valgono' }]
        }
        perche={
          <p>
            <strong>Va bene</strong> lascia la riga agganciata al suo esercente: se domani cambi la
            classificazione di quell’esercente, questa la segue — hai approvato una regola, non
            inciso un valore. <strong>Correggi</strong> dice che questa spesa fa eccezione, e da lì
            in poi nessun automatismo la tocca. È il computer comprato da Euronics.
          </p>
        }
      />

      <PannelloConferma righe={righe} />
    </div>
  );
}
