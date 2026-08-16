import type { Metadata } from 'next';
import { leggiDaConfermare, leggiUltime24Ore } from '@/lib/conferma/leggi';
import { categorieSceglibili } from '@/lib/tassonomia/categorie';
import { leggiStato } from '@/lib/cruscotto/letture';
import { daQuanto, freschezza } from '@/lib/cruscotto/freschezza';
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
  const [righe, recenti, categorie, stato] = await Promise.all([
    leggiDaConfermare(),
    leggiUltime24Ore(),
    categorieSceglibili(),
    leggiStato(),
  ]);
  const valgono = righe.reduce((s, r) => s + centesimiDi(r.amount_eur ?? r.amount), 0n);

  /**
   * Se i dati sono fermi, «nessun pagamento nelle ultime 24 ore» e' falso.
   *
   * E' la domanda del 16 agosto 2026: pagamenti fatti, elenco vuoto. Non
   * mancavano i pagamenti, mancava lo scarico — l'ultima sincronizzazione
   * riuscita era di tre giorni prima. Una schermata che risponde «niente»
   * quando dovrebbe rispondere «non lo so» e' peggio di una che tace: la si
   * crede.
   *
   * Si calcola qui e non dentro il componente perche' li' e' codice del
   * browser, e l'orologio da cui dipende la risposta dev'essere lo stesso che
   * ha letto i dati.
   */
  const ultima = stato
    .map((s) => s.ultima_sync_riuscita)
    .filter((d): d is string => d !== null)
    .sort()
    .at(-1);
  const f = freschezza(ultima ?? null);
  const fermi = f.ferma
    ? `Ultimo scarico dalla banca ${daQuanto(f)}${
        ultima === undefined ? '' : ` (${ultima.slice(0, 10)})`
      }: qui manca tutto quello che hai pagato da allora.`
    : null;

  return (
    <div className="space-y-5">
      <TestataPagina
        titolo="Da confermare"
        cifra={conta(righe.length)}
        etichetta={righe.length === 0 ? 'sei in pari' : 'movimenti nuovi'}
        tinta={righe.length === 0 ? 'var(--conferma)' : null}
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

      <PannelloConferma righe={righe} recenti={recenti} categorie={categorie} fermi={fermi} />
    </div>
  );
}
