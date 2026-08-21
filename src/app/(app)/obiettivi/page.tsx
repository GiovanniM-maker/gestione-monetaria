import type { Metadata } from 'next';
import { leggiObiettivi } from '@/lib/copilota/obiettivi';
import { leggiClassi, perSceglierne } from '@/lib/tassonomia/classi';
import { categorieSceglibili } from '@/lib/tassonomia/categorie';
import { PannelloObiettivi } from './pannello-obiettivi';
import { conta, TestataPagina } from '../testata';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Obiettivi' };

/**
 * Cosa vuoi ottenere, dichiarato una volta.
 *
 * ---------------------------------------------------------------------------
 * Perche' esiste questa schermata
 * ---------------------------------------------------------------------------
 * Gli obiettivi li sa proporre il copilota. Ma il corollario scritto in
 * `docs/copilota.md` dice che **ogni operazione del copilota dev'essere
 * raggiungibile anche senza copilota**: se restasse l'unica strada, di questi
 * dati diventerebbe il proprietario — ed e' precisamente cio' che la sua
 * definizione nega. Il copilota e' una seconda porta, mai la sola.
 *
 * ---------------------------------------------------------------------------
 * Non e' una memoria, ed e' per questo che e' stretta
 * ---------------------------------------------------------------------------
 * Quattro tipi, un bersaglio strutturato, un valore, una nota breve. Niente
 * campo libero in cui infilare qualunque cosa: un sacco chiave-valore accoglie
 * tutto, quindi la prima cosa che **non** e' un obiettivo — «per tre mesi sto
 * arredando casa» — ci finirebbe dentro come stringa perche' ci sta, e a quel
 * punto avremmo ricostruito la memoria testuale col nome di «obiettivi».
 *
 * Quando qualcosa non ci entra deve fare male: e' il segnale che e' un'altra
 * natura di informazione, e che va nel posto suo.
 *
 * ---------------------------------------------------------------------------
 * Ogni obiettivo scade, e non e' burocrazia
 * ---------------------------------------------------------------------------
 * Lo **stato** si autocorregge: una spesa classificata male si vede subito,
 * perche' sposta un numero che si guarda. Un obiettivo no. «Meno di 300 € al
 * mese nei ristoranti», messo a gennaio e dimenticato, ad agosto e' ancora li'
 * — e il copilota continua a ottimizzare per una cosa che non si vuole piu',
 * con la stessa serenita' di quando la si voleva.
 *
 * Alla scadenza non sparisce: diventa **scaduto**, resta qui, e si rinnova con
 * un tocco. Un obiettivo sopravvive perche' lo confermi, non perche' nessuno
 * l'ha cancellato.
 */
export default async function ObiettiviPage() {
  const [obiettivi, classi, categorie] = await Promise.all([
    leggiObiettivi(),
    leggiClassi(),
    categorieSceglibili(),
  ]);

  const attivi = obiettivi.filter((o) => o.stato === 'attivo').length;
  const scaduti = obiettivi.length - attivi;
  // Sotto i trenta giorni: abbastanza presto per rinnovarlo con calma, non
  // cosi' presto da essere sempre vero.
  const inScadenza = obiettivi.filter(
    (o) => o.stato === 'attivo' && o.giorni_alla_scadenza <= 30,
  ).length;

  return (
    <div className="space-y-5">
      <TestataPagina
        titolo="Obiettivi"
        cifra={conta(attivi)}
        etichetta={attivi === 1 ? 'obiettivo attivo' : 'obiettivi attivi'}
        figure={[
          { valore: conta(inScadenza), etichetta: 'in scadenza' },
          { valore: conta(scaduti), etichetta: 'da confermare' },
        ]}
        perche={
          <>
            <p>
              Un obiettivo è <strong>cosa vuoi ottenere</strong>, non un fatto sulle tue spese. I
              fatti — che una spesa era eccezionale, che un abbonamento serve per lavoro — stanno
              sulle spese e sugli esercenti, dove cambiano i numeri. Qui sta solo ciò che{' '}
              <em>non</em> cambia nessun numero: serve al copilota per darti un consiglio che
              riguarda te, invece di un consiglio da manuale.
            </p>
            <p>
              <strong>Ogni obiettivo ha una scadenza</strong>, e sei mesi è il valore predefinito.
              Non è burocrazia: una spesa classificata male si vede, perché sposta un numero che
              guardi; un obiettivo dimenticato no, e continuerebbe a valere per sempre. Scaduto non
              vuol dire cancellato — resta qui, e si rinnova con un tocco.
            </p>
            <p>
              Gli obiettivi attivi arrivano al copilota a <strong>ogni</strong> risposta, non solo
              quando gli viene in mente di chiederli. Quelli scaduti gli arrivano marcati, così può
              chiederti se valgono ancora invece di darli per buoni.
            </p>
          </>
        }
      />
      <PannelloObiettivi
        obiettivi={obiettivi}
        classi={perSceglierne(classi)}
        categorie={categorie}
      />
    </div>
  );
}
